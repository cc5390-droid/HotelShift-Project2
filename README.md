# HotelShift Project (Clean Version)

This is a cleaned, upload-ready version of the original workspace.

## Structure

- `app/`: Web app files (HTML/CSS/JS + sample data)
- `notebooks/`: Analysis notebooks
- `scripts/`: Python scripts for data generation and updates
- `assets/spreadsheets/`: Supporting Excel models and assumptions
- `docs/`: Supporting project documentation
- `README.original.md`: Original top-level README copied from source

## Run App Locally

Open `app/index.html` directly in a browser, or serve with a simple HTTP server:

```bash
cd app
python3 -m http.server 8000
```

Then open: http://localhost:8000

## Notes

- Duplicate nested folders from the original source were intentionally excluded.
- Cache and local system artifacts are ignored via `.gitignore`.
