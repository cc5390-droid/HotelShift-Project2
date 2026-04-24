import json
from datetime import datetime
from functools import reduce
from pathlib import Path

import numpy as np
import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
API_KEY = "722729cfa99e33f0f76a6c4385beb4a6394f1728"

VARIABLES_ACS1 = {
    "Total_Population": "B01003_001E",
    "Laborforce_Population": "DP03_0002E",
    "Employed": "DP03_0004E",
    "Median_Household_Income": "S1903_C03_001E",
    "Median_House_Value": "B25077_001E",
    "Total_Housing_Units": "B25002_001E",
    "House_Occupied": "B25002_002E",
    "House_Vacant": "B25002_003E",
    "Median_Gross_Rent": "B25064_001E",
    "5_to_9_units": "DP04_0011E",
    "10_to_19_units": "DP04_0012E",
    "20_or_more_units": "DP04_0013E",
}

US_STATE_NAME_TO_ABBR = {
    "Alabama": "AL",
    "Alaska": "AK",
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "District of Columbia": "DC",
    "D.C.": "DC",
    "Florida": "FL",
    "Georgia": "GA",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
}


# Full master list of all possible Hotel Conversion Relevance ratings, ordered best → worst.
# These are the ONLY possible values; actual data is always a subset of this list.
MASTER_RATING_ORDER: list[str] = [
    'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'
]

# Non-linear 0–1 scores for each rating.
# Design rationale: steeper penalties for lower tiers (F, D-, D) to reflect higher
# execution/policy risk; small premium for top tiers (A, A+).
# Grades not in the original 9-grade set (A-, B-, C+, D+) are interpolated
# to maintain consistent rank-order spacing within the full 13-grade scale.
MASTER_RATING_SCORES: dict[str, float] = {
    'A+': 1.00,
    'A':  0.90,
    'A-': 0.84,
    'B+': 0.78,
    'B':  0.66,
    'B-': 0.61,
    'C+': 0.57,
    'C':  0.52,
    'C-': 0.40,
    'D+': 0.33,
    'D':  0.25,
    'D-': 0.12,
    'F':  0.00,
}


def base_url(year: int, code: str) -> str:
    if code.startswith("S"):
        return f"https://api.census.gov/data/{year}/acs/acs1/subject"
    if code.startswith("B"):
        return f"https://api.census.gov/data/{year}/acs/acs1"
    if code.startswith("D"):
        return f"https://api.census.gov/data/{year}/acs/acs1/profile"
    raise ValueError(f"Unsupported code: {code}")


def fetch_recent_n_years(code: str, name: str, n_years: int = 6, max_lookback: int = 12) -> pd.DataFrame:
    current_year = datetime.today().year
    out = []

    for year in range(current_year, current_year - max_lookback, -1):
        if len(out) >= n_years:
            break

        params = {
            "get": f"NAME,{code}",
            "for": "metropolitan statistical area/micropolitan statistical area:*",
            "key": API_KEY,
        }
        response = requests.get(base_url(year, code), params=params, timeout=30)
        if response.status_code != 200:
            continue

        payload = response.json()
        if len(payload) <= 1:
            continue

        df = pd.DataFrame(payload[1:], columns=payload[0])
        if code not in df.columns:
            continue

        df = df.rename(
            columns={
                "NAME": "msa_name",
                "metropolitan statistical area/micropolitan statistical area": "msa_code",
                code: name,
            }
        )
        df[name] = pd.to_numeric(df[name], errors="coerce")
        df["year"] = year
        out.append(df[["msa_code", "msa_name", "year", name]])

    if not out:
        raise RuntimeError(f"No Census data fetched for {name} ({code}).")

    return pd.concat(out, ignore_index=True)


def extract_state(msa_name: str) -> str:
    return msa_name.split(", ")[1].split(" ")[0].split("-")[0]


def minmax01(series: pd.Series) -> pd.Series:
    low, high = series.min(), series.max()
    if pd.isna(low) or pd.isna(high) or high == low:
        return pd.Series(np.full(len(series), 0.5), index=series.index)
    return (series - low) / (high - low)


def load_existing_hers_map() -> dict[str, int]:
    existing_file = PROJECT_ROOT / "docs/data/sample_data.json"
    if not existing_file.exists():
        return {}

    with open(existing_file, "r", encoding="utf-8") as file:
        current = json.load(file)

    hers_map: dict[str, int] = {}
    for msa in current.get("msas", []):
        msa_code = str(msa.get("msa_code", "")).strip()
        if not msa_code:
            continue

        hers_value = msa.get("Average_HERS_Index_Score", msa.get("Average HERS Index Score", 0))
        try:
            hers_map[msa_code] = int(round(float(hers_value)))
        except (TypeError, ValueError):
            hers_map[msa_code] = 0

    return hers_map


def load_hers_state_map_for_year(year: int) -> dict[str, int]:
    hers_file = PROJECT_ROOT / "assets" / "spreadsheets" / f"{year}-HERS-Activity-by-State.xlsx"
    if not hers_file.exists():
        print(f"WARN: HERS file not found for {year}: {hers_file}")
        return {}

    hers_df = pd.read_excel(hers_file, skiprows=1, usecols=[0, 2])
    hers_df = hers_df.rename(columns={"Average HERS Index Score": "Average_HERS_Index_Score"})
    hers_df["State"] = hers_df["State"].astype(str).str.strip()
    hers_df["State Code"] = hers_df["State"].map(US_STATE_NAME_TO_ABBR)
    hers_df["Average_HERS_Index_Score"] = pd.to_numeric(hers_df["Average_HERS_Index_Score"], errors="coerce")
    hers_df = hers_df.dropna(subset=["State Code", "Average_HERS_Index_Score"]) 

    return {
        str(row["State Code"]): int(round(float(row["Average_HERS_Index_Score"])))
        for _, row in hers_df.iterrows()
    }


def build_payload() -> dict:
    frames = []
    for name, code in VARIABLES_ACS1.items():
        print(f"Fetching {name}...")
        frames.append(fetch_recent_n_years(code, name, n_years=6))

    msa_features = reduce(
        lambda left, right: pd.merge(left, right, on=["msa_code", "msa_name", "year"], how="outer"),
        frames,
    )
    msa_features["msa_code"] = msa_features["msa_code"].astype(str)
    msa_features = msa_features.sort_values(["msa_code", "year"])
    msa_features["Total_Multi_Units"] = (
        msa_features["5_to_9_units"] + msa_features["10_to_19_units"] + msa_features["20_or_more_units"]
    )

    latest_year = int(msa_features["year"].max())
    hers_by_state = load_hers_state_map_for_year(latest_year)

    eligible_codes = msa_features.loc[
        (msa_features["year"] == latest_year)
        & (msa_features["Total_Population"] >= 300000)
        & (msa_features["msa_name"].str.endswith("Metro Area")),
        "msa_code",
    ].unique()
    msa_features = msa_features[msa_features["msa_code"].isin(eligible_codes)].copy()

    df_tax = pd.read_excel(PROJECT_ROOT / "assets" / "spreadsheets" / "State Property Tax Comparison_ Hotels vs. Multifamily_New.xlsx", sheet_name="Tax new")
    df_tax["Diff_Effective_Rate"] = (
        pd.to_numeric(df_tax["Hotel Effective Rate"], errors="coerce")
        - pd.to_numeric(df_tax["Multifamily Effective Rate"], errors="coerce")
    )
    cap_file = PROJECT_ROOT / "assets" / "spreadsheets" / "Hotel_vs_MF_Cap_Rate_Spread_Analysis.xlsx"
    OPEX_file = PROJECT_ROOT / "assets" / "spreadsheets" / "State OPEX Assumptions for Housing.xlsx"

    df_cap = pd.read_excel(cap_file, sheet_name="Cap Rate Spread Analysis", usecols="A:H", header=3, nrows=50)
    


    df_cap_tax = pd.merge(
        df_cap[["State", "Hotel Cap Rate", "MF Cap Rate"]],
        df_tax[["State Code", "State", "Hotel Effective Rate", "Multifamily Effective Rate", "Diff_Effective_Rate"]],
        on="State",
        how="left",
    )

    msa_features["State Code"] = msa_features["msa_name"].apply(extract_state)
    msa_features["Average_HERS_Index_Score"] = msa_features["State Code"].map(hers_by_state)
    msa_features = pd.merge(
        msa_features,
        df_cap_tax[
            [
                "State",
                "State Code",
                "Hotel Cap Rate",
                "MF Cap Rate",
                "Hotel Effective Rate",
                "Multifamily Effective Rate",
                "Diff_Effective_Rate",
            ]
        ],
        on="State Code",
        how="left",
    )

    df_OER = pd.read_excel(OPEX_file)
    df_OER = df_OER.rename(columns={"Default OPEX %": "OPEX%"})
    df_OER["State Code"] = df_OER["State Code"].astype(str)
    df_OER["OPEX%"] = pd.to_numeric(df_OER["OPEX%"], errors="coerce")
    msa_features = pd.merge(msa_features, df_OER[["State Code", "OPEX%"]], on="State Code", how="left")


    df_Conversion_Category = pd.read_excel(cap_file, sheet_name="Regulatory Environment", usecols="A:C", header=3, nrows=50)
    rating_col = 'Conversion Category'  # the rating column is the third column in the "Regulatory Environment" sheet
    df_Conversion_Category[rating_col] = df_Conversion_Category[rating_col].astype(str).str.strip()
    # Keep the letter grade as Hotel_Conversion_Relevance (string, e.g. "A+", "B-")
    df_Conversion_Category["Hotel_Conversion_Relevance"] = df_Conversion_Category[rating_col]

    # Detect which ratings actually appear in this dataset (must be a subset of MASTER_RATING_ORDER)
    actual_ratings = (
        df_Conversion_Category[rating_col]
        .dropna()
        .astype(str)
        .str.strip()
        .unique()
        .tolist()
    )
    unrecognised = [r for r in actual_ratings if r and r.lower() != "nan" and r not in MASTER_RATING_SCORES]
    if unrecognised:
        print(f"WARN: Unrecognised rating(s) found – will map to NaN: {unrecognised}")

    # Non-linear 0–1 scores are drawn directly from the full master mapping,
    # so adding new grades (B-, C+, D+, etc.) never breaks existing assignments.
    df_Conversion_Category["Hotel_Conversion_Relevance_Score"] = (
        df_Conversion_Category[rating_col].map(MASTER_RATING_SCORES)
    )

    msa_features = pd.merge(
        msa_features,
        df_Conversion_Category[["State", "Hotel_Conversion_Relevance", "Hotel_Conversion_Relevance_Score"]],
        on="State",
        how="left",
    )



    msa_features = msa_features.dropna().copy().sort_values(["msa_code", "year"]).reset_index(drop=True)

    factor_df = msa_features.copy()
 

    # # ── 1. construct Economic factors ─────────────────────────────────────────────────
    # factor_df['Employment_Rate'] = factor_df['Employed'] / factor_df['Laborforce_Population'].clip(lower=0, upper=1)   
    # factor_df['Employment_Growth'] = factor_df.groupby(['msa_code'])['Employed'].pct_change()
    # factor_df['Pop_Growth'] = factor_df.groupby(['msa_code'])['Total_Population'].pct_change()
    # factor_df['Income_Growth'] = factor_df.groupby(['msa_code'])['Median_Household_Income'].pct_change()

    # # ── 2. construct Housing Affordability factors ─────────────────────────────────────
    # factor_df['Rent_to_Income_Ratio'] = np.where(factor_df['Median_Household_Income'] > 0, 12*factor_df['Median_Gross_Rent'] / factor_df['Median_Household_Income'], np.nan)
    # factor_df['Vacancy_Rate'] = np.where(factor_df['Total_Housing_Units'] > 0,factor_df['House_Vacant'] / (factor_df['House_Vacant'] + factor_df['House_Occupied']), np.nan)

    # # ── 3. construct Supply Pressure factors ─────────────────────────────────────
    # factor_df['New_Multi_Units'] = factor_df.groupby(['msa_code'])['Total_Multi_Units'].diff().clip(lower=0)

    # # ── 4. construct Pricing Power factors ─────────────────────────────────────
    # factor_df['Rent_Growth'] = factor_df.groupby(['msa_code'])['Median_Gross_Rent'].pct_change()

    # # ── 5. construct valuation factors ─────────────────────────────────────
    # factor_df['Value_Creation'] = (12*factor_df['Median_Gross_Rent']*(1-factor_df['OPEX%']))*(1/factor_df['Multifamily Cap'] - 1/factor_df['Hotel Cap'])


    # # ── 6. construct Regulatory Environment factors ─────────────────────────────────────
    # ≈['Hotel_Conversion_Relevance'] = factor_df['Hotel_Conversion_Relevance']


    # fixed data version: see if the ranking system will perform better
    # ── 1. construct Economic factors ─────────────────────────────────────────────────
    factor_df['Employment_Rate'] = (factor_df['Employed'] / factor_df['Laborforce_Population']).clip(lower=0, upper=1)   # BUG FIX: negatives & >1 are Census data errors
    factor_df['Employment_Growth'] = (factor_df.groupby('msa_code')['Employed'].pct_change())
    factor_df['Pop_Growth'] = (factor_df.groupby('msa_code')['Total_Population'].pct_change())
    factor_df['Income_Growth'] = (factor_df.groupby('msa_code')['Median_Household_Income'].pct_change())


    # ── 2.construct Housing Affordability factors ─────────────────────────────────────

    # Rent-to-Income Ratio: guard zero denominator
    factor_df['Rent_to_Income_Ratio'] = np.where(factor_df['Median_Household_Income'] > 0,12*factor_df['Median_Gross_Rent'] / factor_df['Median_Household_Income'],np.nan)



    # ── 3. construct Supply Demand factors ─────────────────────────────────────
    # New Multi Units: clip negatives to 0 (MSA rezoning artefact)
    factor_df['New_Multi_Units'] = (factor_df.groupby('msa_code')['Total_Multi_Units'].diff().clip(lower=0))  # BUG FIX: was 15-20% negative
        # Vacancy Rate (Formula from Factor_Description: Vacant / Total_Housing_Units)
    factor_df['Vacancy_Rate'] = np.where(factor_df['Total_Housing_Units'] > 0,factor_df['House_Vacant'] / factor_df['Total_Housing_Units'],np.nan)


    # ── 4. construct Pricing Power factors ─────────────────────────────────────
    factor_df['Rent_Growth'] = (factor_df.groupby('msa_code')['Median_Gross_Rent'].pct_change())

    # ── 5. construct Valuation factors ─────────────────────────────────────
    # Value_Creation:Annual Rent * (1 - OPEX%) / Multifamily Cap Rate - Annual Rent * (1 - OPEX%) / Hotel Cap Rate
    factor_df['Value_Creation'] =  np.where( (factor_df['Multifamily Effective Rate'] > 0) & (factor_df['Hotel Cap Rate'] > 0),(12*factor_df['Median_Gross_Rent']*(1-factor_df['OPEX%']))*(1/factor_df['MF Cap Rate'] - 1/factor_df['Hotel Cap Rate']), np.nan)


    # ── 6. construct Regulatory Environment factors ─────────────────────────────────────
    factor_df["Hotel_Conversion_Relevance"] = factor_df["Hotel_Conversion_Relevance"].astype(str).str.strip()
    factor_df["Hotel_Conversion_Relevance_Score"] = pd.to_numeric(
        factor_df["Hotel_Conversion_Relevance_Score"], errors="coerce"
    )

    factor_cols = ['Employment_Rate',
             'Employment_Growth',
             'Pop_Growth',
             'Income_Growth',
             'Rent_to_Income_Ratio',
             'New_Multi_Units',
             'Vacancy_Rate',
             'Rent_Growth',
             'Value_Creation',
             'Hotel_Conversion_Relevance_Score']  # numeric 0-1; letter grade kept separately in Hotel_Conversion_Relevance

    earliest_year = int(factor_df["year"].min())
    factor_df = factor_df[factor_df["year"] > earliest_year].copy()
    required_non_hers_cols = [
        "msa_code",
        "msa_name",
        "year",
        "Total_Population",
        "Median_Gross_Rent",
        "Median_Household_Income",
        "Median_House_Value",
        "OPEX%",
        "Hotel Cap Rate",
        "MF Cap Rate",
        "Hotel Effective Rate",
        "Multifamily Effective Rate",
        "Hotel_Conversion_Relevance",
    ] + factor_cols

    factor_df = factor_df[
        [
            "msa_code",
            "msa_name",
            "year",
            "Total_Population",
            "Median_Gross_Rent",
            "Median_Household_Income",
            "Median_House_Value",
            "OPEX%",
            "Hotel Cap Rate",
            "MF Cap Rate",
            "Hotel Effective Rate",
            "Multifamily Effective Rate",
            "Hotel_Conversion_Relevance",
            "Average_HERS_Index_Score",
        ]
        + factor_cols
    ].dropna(subset=required_non_hers_cols)

    latest_year = int(factor_df["year"].max())
    raw_latest = factor_df[factor_df["year"] == latest_year].copy()

    scored = raw_latest[["msa_code", "msa_name"] + factor_cols].copy()
    for col in factor_cols:
        std = scored[col].std()
        scored[col] = 0.0 if std == 0 or pd.isna(std) else (scored[col] - scored[col].mean()) / std

    scored["Vacancy_Rate"] = -scored["Vacancy_Rate"]
    scored["New_Multi_Units"] = -scored["New_Multi_Units"]

    scored["Economic_Index"] = scored[["Employment_Rate", "Employment_Growth", "Pop_Growth", "Income_Growth"]].mean(axis=1)
    scored["Affordability_Index"] = scored["Rent_to_Income_Ratio"]
    scored["Supply_Index"] = scored[["New_Multi_Units", "Vacancy_Rate"]].mean(axis=1)
    scored["Pricing_Index"] = scored["Rent_Growth"]
    scored["Valuation_Index"] = scored["Value_Creation"]
    scored["Regulatory_Index"] = scored["Hotel_Conversion_Relevance_Score"]

    scored["Index_Score_Raw"] = (
        0.20 * scored["Economic_Index"]
        + 0.15 * scored["Affordability_Index"]
        + 0.15 * scored["Supply_Index"]
        + 0.15 * scored["Pricing_Index"]
        + 0.15 * scored["Valuation_Index"]
        + 0.20 * scored["Regulatory_Index"]
    )

    # Linear transformation: z-score (-3 to 3) → score (0 to 100)
    # weighted_z_score = -3 → score = 0
    # weighted_z_score = 0  → score = 50
    # weighted_z_score = 3  → score = 100
    scored["Investment_Score"] = ((scored["Index_Score_Raw"] + 3) / 6) * 100

    for col in [
        "Economic_Index",
        "Affordability_Index",
        "Supply_Index",
        "Pricing_Index",
        "Valuation_Index",
        "Regulatory_Index",
    ]:
        scored[col] = minmax01(scored[col])

    hers_map = load_existing_hers_map()

    merged = raw_latest.merge(
        scored[
            [
                "msa_code",
                "Economic_Index",
                "Affordability_Index",
                "Supply_Index",
                "Pricing_Index",
                "Valuation_Index",
                "Regulatory_Index",
                "Investment_Score",
            ]
        ],
        on="msa_code",
        how="inner",
    )

    records = []
    for _, row in merged.iterrows():
        msa_code = str(row["msa_code"])
        vacancy_rate = float(row["Vacancy_Rate"])
        

        record = {
            "msa_code": int(msa_code),
            "msa_name": row["msa_name"],
            "year": latest_year,
            "Total_Population": int(round(float(row["Total_Population"]))),
            "Median_Rent": int(round(float(row["Median_Gross_Rent"]))),
            "Median_Income": int(round(float(row["Median_Household_Income"]))),
            "Median_Home_Value": int(round(float(row["Median_House_Value"]))),
            "Operating_Expense_Ratio": float(row["OPEX%"]),
            "Hotel_Cap_Rate": float(row["Hotel Cap Rate"]),
            "Multifamily_Cap_Rate": float(row["MF Cap Rate"]),
            "Hotel_Effective_Tax_Rate": float(row["Hotel Effective Rate"]),
            "Multifamily_Effective_Tax_Rate": float(row["Multifamily Effective Rate"]),
            "Employment_Rate": float(row["Employment_Rate"]),
            "Employment_Growth": float(row["Employment_Growth"]),
            "Pop_Growth": float(row["Pop_Growth"]),
            "Income_Growth": float(row["Income_Growth"]),
            "Rent_to_Income_Ratio": float(row["Rent_to_Income_Ratio"]),
            "New_Multi_Units": int(round(float(row["New_Multi_Units"]))),
            "Vacancy_Rate": float(row["Vacancy_Rate"]),
            "Rent_Growth": float(row["Rent_Growth"]),
            "Value_Creation": float(row["Value_Creation"]),
            "Hotel_Conversion_Relevance": str(row["Hotel_Conversion_Relevance"]),
            "Average_HERS_Index_Score": int(round(float(row["Average_HERS_Index_Score"])))
            if pd.notna(row.get("Average_HERS_Index_Score", np.nan))
            else hers_map.get(msa_code, 0),
            "Investment_Score": float(row["Investment_Score"])
            
        }

        for key, value in list(record.items()):
            if isinstance(value, float):
                record[key] = round(value, 6)

        records.append(record)

    records.sort(key=lambda item: item["Investment_Score"], reverse=True)

    return {
        "stats": {
            "year": latest_year,
            "total_msa_count": len(records),
            "scoring_system": "6-Dimensional Index (Economic, Stability, Supply, Pricing, Valuation, Regulatory) with z-score normalization and weighted average",
        },
        "msas": records,
    }


def main() -> None:
    payload = build_payload()

    targets = [
        PROJECT_ROOT / "docs/data/sample_data.json",
    ]

    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        print(f"Updated: {target}")

    print(f"Year: {payload['stats']['year']} | MSA count: {payload['stats']['total_msa_count']}")
    print("Top 5 MSAs:")
    for msa in payload["msas"][:5]:
        print(f" - {msa['msa_name']} ({msa['Investment_Score']})")


if __name__ == "__main__":
    main()
