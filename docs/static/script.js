// ========================================
// Global Variables
// ========================================

let allMSAs = [];
let currentChart = null;
let radarChart = null;
let currentWeights = {
    economic: 0.25,
    stability: 0.15,
    supply: 0.15,
    pricing: 0.15,
    valuation: 0.20,
    capital: 0.10
};

// ========================================
// Initialize Application
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 MSA Investment Analyzer Initializing...');
    launchApp();
});

async function launchApp() {
    console.log('🚀 Starting launchApp()...');
    
    // Ensure only Overview is visible initially
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById('overviewView').classList.add('active');
    
    await loadData();
    setupEventListeners();
    
    console.log('✅ launchApp() complete');
}

function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchMSA();
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', function (e) {
        if (e.target.id !== 'searchInput') {
            document.getElementById('suggestionsList').innerHTML = '';
        }
    });
}

// ========================================
// Data Loading
// ========================================

async function loadData(retries = 3, delayMs = 1000) {
    try {
        console.log('📡 Fetching rankings data...');
        const response = await axios.get('/api/msa-rankings');
        allMSAs = response.data.msas;

        console.log(`✅ Loaded ${allMSAs.length} MSAs`);

        // Load stats and populate UI
        console.log('📊 Loading stats...');
        await loadStats();
        console.log('✅ Stats loaded');

        // Render initial views
        console.log('🎨 Rendering initial views...');
        renderOverviewView();
        console.log('✅ renderOverviewView done');
        
        renderTop10View();
        console.log('✅ renderTop10View done');
        
        renderComparisonView();
        console.log('✅ renderComparisonView done');
        
        console.log('✅ All views rendered successfully');
    } catch (error) {
        console.error(`❌ Error loading data (retries left=${retries}):`, error);
        if (retries > 0) {
            console.log(`⏱ retrying in ${delayMs}ms...`);
            await new Promise(res => setTimeout(res, delayMs));
            return loadData(retries - 1, delayMs);
        }
        document.getElementById('tableBody').innerHTML = `
            <tr><td colspan="5" style="color: red; padding: 20px;">Error loading data. Please refresh the page.</td></tr>
        `;
    }
}

async function loadStats() {
    try {
        const response = await axios.get('/api/stats');
        const stats = response.data;

        document.getElementById('totalMSA').textContent = stats.total_msas;
        document.getElementById('avgScore').textContent = stats.avg_score;
        document.getElementById('maxScore').textContent = stats.max_score;
        document.getElementById('yearValue').textContent = stats.latest_year;
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// ========================================
// View Management
// ========================================

function setView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));

    // Remove active state from all buttons
    document.querySelectorAll('.filter-buttons button').forEach(b => b.classList.remove('btn-active'));

    // Show selected view and activate button
    const viewMap = {
        'overview': 'overviewView',
        'scoring': 'scoringView',
        'detailed': 'detailedView',
        'comparison': 'comparisonView',
        'rawdata': 'rawdataView'
    };

    if (viewMap[viewName]) {
        document.getElementById(viewMap[viewName]).classList.add('active');
    }

    // Mark corresponding button as active
    event.target.classList.add('btn-active');

    // Handle specific view rendering
    if (viewName === 'overview') {
        renderOverviewView();
    } else if (viewName === 'scoring') {
        renderScoringView();
    } else if (viewName === 'rawdata') {
        renderRawDataView();
    } else if (viewName === 'comparison') {
        renderComparisonView();
    }
}

// ========================================
// Overview View
// ========================================

function renderOverviewView() {
    console.log('📊 Rendering Overview View...');
    console.log(`📊 allMSAs length: ${allMSAs.length}`);
    
    // Ensure overviewView is visible
    const overviewView = document.getElementById('overviewView');
    if (overviewView) {
        console.log('✅ Found overviewView element');
        if (!overviewView.classList.contains('active')) {
            console.log('⚠️  overviewView not active, adding active class');
            overviewView.classList.add('active');
        }
    } else {
        console.error('❌ overviewView element not found!');
    }

    // Render distribution chart
    try {
        renderDistributionChart();
        console.log('✅ Distribution chart rendered');
    } catch (e) {
        console.error('❌ Error rendering chart:', e);
    }

    // Render ranking table
    try {
        renderRankingTable();
        console.log('✅ Ranking table rendered');
    } catch (e) {
        console.error('❌ Error rendering ranking table:', e);
    }
}

function renderDistributionChart() {
    const scores = allMSAs.map(m => m.Investment_Score || 0);

    const ctx = document.getElementById('distributionChart');
    if (currentChart) currentChart.destroy();

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: allMSAs.slice(0, 15).map(m => m.msa_name.substring(0, 20) + '...'),
            datasets: [{
                label: 'Investment Score',
                data: scores.slice(0, 15),
                backgroundColor: 'rgba(102, 126, 234, 0.7)',
                borderColor: 'rgba(118, 75, 162, 1)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: '#999' }
                },
                x: { ticks: { color: '#999' } }
            }
        }
    });
}

function renderRankingTable() {
    console.log('🔍 Starting renderRankingTable()...');
    
    const tbody = document.getElementById('tableBody');
    if (!tbody) {
        console.error('❌ tableBody element not found!');
        return;
    }
    
    console.log(`✅ Found tableBody element`);
    console.log(`📊 About to render ${allMSAs.length} MSAs`);
    
    tbody.innerHTML = '';

    allMSAs.slice(0, 20).forEach((msa, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${msa.msa_name}</strong></td>
            <td>${formatNumber(msa.Total_Population)}</td>
            <td><strong style="color: #667eea;">${(msa.Investment_Score || 0).toFixed(2)}</strong></td>
            <td><button onclick="showMSADetail(${msa.msa_code})">View</button></td>
        `;
        tbody.appendChild(row);
    });
    
    console.log(`✅ Rendered ${Math.min(20, allMSAs.length)} rows`);
}

// ========================================
// Scoring View (Interactive Weights)
// ========================================

function renderScoringView() {
    console.log('⚙️ Rendering Scoring View...');
    
    // Initialize sliders with current weights
    document.getElementById('weightEconomic').value = currentWeights.economic * 100;
    document.getElementById('weightStability').value = currentWeights.stability * 100;
    document.getElementById('weightSupply').value = currentWeights.supply * 100;
    document.getElementById('weightPricing').value = currentWeights.pricing * 100;
    document.getElementById('weightValuation').value = currentWeights.valuation * 100;
    document.getElementById('weightCapital').value = currentWeights.capital * 100;
    
    updateWeights();
}

function resetWeights() {
    // Set all sliders back to default values
    document.getElementById('weightEconomic').value = 25;
    document.getElementById('weightStability').value = 15;
    document.getElementById('weightSupply').value = 15;
    document.getElementById('weightPricing').value = 15;
    document.getElementById('weightValuation').value = 20;
    document.getElementById('weightCapital').value = 10;
    
    // Trigger update to recalculate
    updateWeights();
}

function updateWeights() {
    // Read all slider values
    const economic = parseInt(document.getElementById('weightEconomic').value);
    const stability = parseInt(document.getElementById('weightStability').value);
    const supply = parseInt(document.getElementById('weightSupply').value);
    const pricing = parseInt(document.getElementById('weightPricing').value);
    const valuation = parseInt(document.getElementById('weightValuation').value);
    const capital = parseInt(document.getElementById('weightCapital').value);
    
    // Update display values
    document.getElementById('valueEconomic').textContent = economic + '%';
    document.getElementById('valueStability').textContent = stability + '%';
    document.getElementById('valueSupply').textContent = supply + '%';
    document.getElementById('valuePricing').textContent = pricing + '%';
    document.getElementById('valueValuation').textContent = valuation + '%';
    document.getElementById('valueCapital').textContent = capital + '%';
    
    // Calculate total
    const total = economic + stability + supply + pricing + valuation + capital;
    document.getElementById('totalWeight').textContent = total + '%';
    
    // Normalize weights if total is not 100
    if (total > 0) {
        currentWeights = {
            economic: economic / total,
            stability: stability / total,
            supply: supply / total,
            pricing: pricing / total,
            valuation: valuation / total,
            capital: capital / total
        };
    }
    
    // Recalculate scores
    calculateScores();
    renderScoringTable();
}

function calculateScores() {
    allMSAs.forEach(msa => {
        msa.customScore = (
            (msa.Economic_Index || 0) * currentWeights.economic +
            (msa.Stability_Index || 0) * currentWeights.stability +
            (msa.Supply_Index || 0) * currentWeights.supply +
            (msa.Pricing_Index || 0) * currentWeights.pricing +
            (msa.Valuation_Index || 0) * currentWeights.valuation +
            (msa.Capital_Index || 0) * currentWeights.capital
        ) * 100;
    });
}

function renderScoringTable() {
    const tbody = document.getElementById('scoringTableBody');
    tbody.innerHTML = '';
    
    const sorted = [...allMSAs].sort((a, b) => (b.customScore || 0) - (a.customScore || 0));
    
    // Check if weights are at default values
    const isDefaultWeights = 
        Math.abs(currentWeights.economic - 0.25) < 0.01 &&
        Math.abs(currentWeights.stability - 0.15) < 0.01 &&
        Math.abs(currentWeights.supply - 0.15) < 0.01 &&
        Math.abs(currentWeights.pricing - 0.15) < 0.01 &&
        Math.abs(currentWeights.valuation - 0.20) < 0.01 &&
        Math.abs(currentWeights.capital - 0.10) < 0.01;
    
    sorted.slice(0, 10).forEach((msa, index) => {
        const originalRank = allMSAs.findIndex(m => m.msa_code === msa.msa_code) + 1;
        // If weights are at default, change should be 0
        const scoreChange = isDefaultWeights ? 0 : ((msa.customScore || 0) - (msa.Investment_Score || 0)).toFixed(1);
        const changeColor = scoreChange > 0 ? '#4caf50' : scoreChange < 0 ? '#f44336' : '#999';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${msa.msa_name}</strong></td>
            <td><strong style="color: #667eea;">${(msa.customScore || 0).toFixed(2)}</strong></td>
            <td style="color: ${changeColor}; font-weight: bold;">${scoreChange > 0 ? '+' : ''}${scoreChange}</td>
        `;
        tbody.appendChild(row);
    });
}

// ========================================
// Raw Data View
// ========================================

function renderRawDataView() {
    console.log('📊 Rendering Raw Data View...');
    renderRawDataTable();
}

function renderRawDataTable() {
    const sorted = [...allMSAs].sort((a, b) => (b.Investment_Score || 0) - (a.Investment_Score || 0));
    
    // Create header
    const headerRow = document.getElementById('rawDataHeader');
    headerRow.innerHTML = `
        <tr>
            <th>Rank</th>
            <th>MSA Name</th>
            <th>Population</th>
            <th>Pop Growth %</th>
            <th>Median Income</th>
            <th>Income Growth %</th>
            <th>Employment Rate %</th>
            <th>Median Rent</th>
            <th>Rent/Income %</th>
            <th>Home Value</th>
            <th>Vacancy Rate %</th>
            <th>Cap Spread %</th>
            <th>Tax Diff %</th>
            <th>HERS Score</th>
            <th>Investment Score</th>
        </tr>
    `;
    
    // Create body
    const tbody = document.getElementById('rawDataBody');
    tbody.innerHTML = '';
    
    sorted.forEach((msa, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${msa.msa_name}</strong></td>
            <td>${formatNumber(msa.Total_Population)}</td>
            <td>${((msa.Pop_Growth || 0) * 100).toFixed(2)}</td>
            <td>$${formatNumber(Math.round(msa.Median_Income || 0))}</td>
            <td>${((msa.Income_Growth || 0) * 100).toFixed(2)}</td>
            <td>${((msa.Employment_Rate || 0) * 100).toFixed(1)}</td>
            <td>$${formatNumber(Math.round(msa.Median_Rent || 0))}</td>
            <td>${((msa.Rent_to_Income_Ratio || 0) * 100).toFixed(1)}</td>
            <td>$${formatNumber(Math.round(msa.Median_Home_Value || 0))}</td>
            <td>${((msa.Vacancy_Rate || 0) * 100).toFixed(1)}</td>
            <td>${(msa['Cap Spread'] || 0).toFixed(2)}</td>
            <td>${(msa.Diff_Effective_Rate || 0).toFixed(2)}</td>
            <td>${Math.round(msa['Average HERS Index Score'] || 0)}</td>
            <td><strong style="color: #667eea;">${(msa.Investment_Score || 0).toFixed(2)}</strong></td>
        `;
        tbody.appendChild(row);
    });
}

function downloadRawData() {
    const sorted = [...allMSAs].sort((a, b) => (b.Investment_Score || 0) - (a.Investment_Score || 0));
    
    let csv = 'Rank,MSA Name,Population,Pop Growth %,Median Income,Income Growth %,Employment Rate %,Median Rent,Rent/Income %,Home Value,Vacancy Rate %,Cap Spread %,Tax Diff %,HERS Score,Investment Score\n';
    
    sorted.forEach((msa, index) => {
        csv += `${index + 1},"${msa.msa_name}",${msa.Total_Population},${((msa.Pop_Growth || 0) * 100).toFixed(2)},${msa.Median_Income},${((msa.Income_Growth || 0) * 100).toFixed(2)},${((msa.Employment_Rate || 0) * 100).toFixed(1)},${msa.Median_Rent},${((msa.Rent_to_Income_Ratio || 0) * 100).toFixed(1)},${msa.Median_Home_Value},${((msa.Vacancy_Rate || 0) * 100).toFixed(1)},${(msa['Cap Spread'] || 0).toFixed(2)},${(msa.Diff_Effective_Rate || 0).toFixed(2)},${Math.round(msa['Average HERS Index Score'] || 0)},${(msa.Investment_Score || 0).toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'msa_raw_data.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    
    console.log('✅ CSV downloaded');
}

function updateRawData() {
    renderRawDataTable();
}

// ========================================
// Comparison / 6D Analysis View
// ========================================

let selectedMSAsForComparison = [];

function renderComparisonView() {
    console.log('📈 Rendering 6D Analysis View...');

    // Initialize with top 3
    const top3 = allMSAs.slice(0, 3);
    selectedMSAsForComparison = top3.map(m => m.msa_code);
    
    renderMSAList();
    renderRadarChart();
}

function renderMSAList() {
    const input = document.getElementById('msaSelector');
    const listDiv = document.getElementById('msaList');
    const query = input.value.toLowerCase();
    
    let filtered = allMSAs;
    if (query) {
        filtered = allMSAs.filter(m => m.msa_name.toLowerCase().includes(query));
    }
    
    listDiv.innerHTML = '';
    
    if (query && filtered.length > 0) {
        filtered.slice(0, 8).forEach(msa => {
            const div = document.createElement('div');
            div.className = 'msa-list-item';
            const isSelected = selectedMSAsForComparison.includes(msa.msa_code);
            div.style.background = isSelected ? '#667eea' : '#f0f0f0';
            div.style.color = isSelected ? 'white' : '#333';
            div.innerHTML = `<strong>${msa.msa_name}</strong> (Score: ${(msa.Investment_Score || 0).toFixed(1)})`;
            div.style.cursor = 'pointer';
            div.style.padding = '10px';
            div.style.marginBottom = '5px';
            div.style.borderRadius = '6px';
            div.style.transition = 'all 0.3s';
            
            div.onclick = () => toggleMSASelection(msa.msa_code);
            div.onmouseover = () => {
                if (!isSelected) div.style.background = '#e0e0e0';
            };
            div.onmouseout = () => {
                if (!isSelected) div.style.background = '#f0f0f0';
            };
            
            listDiv.appendChild(div);
        });
    }
}

function filterMSAList() {
    renderMSAList();
}

function toggleMSASelection(msaCode) {
    const index = selectedMSAsForComparison.indexOf(msaCode);
    if (index > -1) {
        selectedMSAsForComparison.splice(index, 1);
    } else {
        selectedMSAsForComparison.push(msaCode);
    }
    
    if (selectedMSAsForComparison.length === 0) {
        // Always keep at least one selected
        selectedMSAsForComparison.push(msaCode);
    }
    
    renderMSAList();
    renderRadarChart();
}

function renderRadarChart() {
    console.log('📊 Rendering Radar Chart...');

    const categories = [
        'Economic_Index', 'Stability_Index', 'Supply_Index',
        'Pricing_Index', 'Valuation_Index', 'Capital_Index'
    ];
    
    const categoryLabels = ['Economic', 'Stability', 'Supply', 'Pricing', 'Valuation', 'Capital'];
    
    const selectedMSAs = allMSAs.filter(m => selectedMSAsForComparison.includes(m.msa_code));
    
    const datasets = selectedMSAs.map((msa, idx) => ({
        label: msa.msa_name,
        data: categories.map(cat => {
            const val = msa[cat] || 0;
            // Normalize to 0-100 scale
            return (val * 50); // Scale indices appropriately
        }),
        borderColor: getColorForIndex(idx),
        backgroundColor: getColorForIndex(idx, 0.15),
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
    }));

    const ctx = document.getElementById('radarChart');
    if (radarChart) radarChart.destroy();

    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: categoryLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        font: { size: 12 },
                        boxWidth: 10
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        color: '#999',
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    });
}

function getColorForIndex(idx, opacity = 1) {
    const colors = [
        `rgba(102, 126, 234, ${opacity})`,
        `rgba(118, 75, 162, ${opacity})`,
        `rgba(200, 120, 170, ${opacity})`,
        `rgba(240, 150, 160, ${opacity})`,
        `rgba(200, 160, 200, ${opacity})`
    ];
    return colors[idx % colors.length];
}

// ========================================
// MSA Detail View
// ========================================

async function showMSADetail(msaCode) {
    console.log(`🔍 Loading details for MSA ${msaCode}...`);

    try {
        const response = await axios.get(`/api/msa/${msaCode}`);
        const msa = response.data;

        const detailHtml = `
            <div class="msa-detail">
                <h3>${msa.msa_name}</h3>
                <p style="color: #999; margin-bottom: 20px;">MSA Code: ${msa.msa_code}</p>

                <h4 style="margin-top: 25px; margin-bottom: 15px; color: #667eea;">📊 Demographics</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Total Population</div>
                        <div class="detail-value">${formatNumber(msa.Total_Population)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Employment Rate</div>
                        <div class="detail-value">${(msa.Employment_Rate * 100 || 0).toFixed(1)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Median Household Income</div>
                        <div class="detail-value">$${formatNumber(Math.round(msa.Median_Income || 0))}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Population Growth</div>
                        <div class="detail-value">${(msa.Pop_Growth * 100 || 0).toFixed(2)}%</div>
                    </div>
                </div>

                <h4 style="margin-top: 25px; margin-bottom: 15px; color: #667eea;">🏠 Real Estate</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Median Gross Rent</div>
                        <div class="detail-value">$${formatNumber(Math.round(msa.Median_Rent || 0))}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Median House Value</div>
                        <div class="detail-value">$${formatNumber(Math.round(msa.Median_Home_Value || 0))}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Vacancy Rate</div>
                        <div class="detail-value">${(msa.Vacancy_Rate * 100 || 0).toFixed(1)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Implied MF Value</div>
                        <div class="detail-value">$${formatNumber(Math.round(msa.Implied_Value || 0))}</div>
                    </div>
                </div>

                <h4 style="margin-top: 25px; margin-bottom: 15px; color: #667eea;">💼 Investment Metrics</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Investment Score</div>
                        <div class="detail-value" style="color: #667eea;">${(msa.Investment_Score || 0).toFixed(2)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Cap Spread</div>
                        <div class="detail-value">${(msa['Cap Spread'] || 0).toFixed(2)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Tax Rate Difference</div>
                        <div class="detail-value">${(msa.Diff_Effective_Rate || 0).toFixed(2)}%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">HERS Index Score</div>
                        <div class="detail-value">${(msa['Average HERS Index Score'] || 0).toFixed(0)}</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('msaDetail').innerHTML = detailHtml;
        
        // Switch to detailed view
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById('detailedView').classList.add('active');
        document.getElementById('detailedView').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('❌ Error loading MSA detail:', error);
        document.getElementById('msaDetail').innerHTML = `<p style="color: red;">Error loading MSA details.</p>`;
    }
}

// ========================================
// Search Functionality
// ========================================

// ========================================
// Search and Autocomplete
// ========================================

function handleSearchInput() {
    const input = document.getElementById('searchInput').value.trim().toLowerCase();
    const suggestionsList = document.getElementById('suggestionsList');

    if (input.length === 0) {
        suggestionsList.innerHTML = '';
        return;
    }

    // Filter MSAs by name or code
    const suggestions = allMSAs.filter(msa => 
        msa.msa_name.toLowerCase().includes(input) ||
        msa.msa_code.toString().includes(input)
    ).slice(0, 8); // Limit to 8 suggestions

    if (suggestions.length === 0) {
        suggestionsList.innerHTML = '<li class="no-suggestion">No MSAs found</li>';
        return;
    }

    suggestionsList.innerHTML = suggestions.map(msa => 
        `<li onclick="selectSuggestion('${msa.msa_code}', '${msa.msa_name.replace(/'/g, "\\'")}')">${msa.msa_name}</li>`
    ).join('');
}

function selectSuggestion(msaCode, msaName) {
    document.getElementById('searchInput').value = msaName;
    document.getElementById('suggestionsList').innerHTML = '';
    showMSADetail(msaCode);
}

async function searchMSA() {
    const query = document.getElementById('searchInput').value.trim();

    if (!query) {
        alert('Please enter a search query');
        return;
    }

    try {
        const response = await axios.get('/api/search', { params: { q: query } });
        const results = response.data.results;

        if (results.length === 0) {
            alert('No MSAs found matching your query');
            return;
        }

        // Show first result's details
        showMSADetail(results[0].msa_code);
        document.getElementById('searchInput').value = '';

    } catch (error) {
        console.error('❌ Error searching:', error);
    }
}

// ========================================
// Modal Functions
// ========================================

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

window.onclick = function (event) {
    const modal = document.getElementById('detailModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// ========================================
// Utility Functions
// ========================================

function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCurrency(num) {
    if (!num) return '$0';
    return '$' + formatNumber(Math.round(num));
}

// ========================================
// AI Assistant Chat Functions
// ========================================

let aiAvailable = false;

// Check AI status on page load
async function checkAIStatus() {
    try {
        const response = await axios.get('/api/ai-status');
        aiAvailable = response.data.available;
        updateAIStatusDisplay();
    } catch (e) {
        console.warn('Could not check AI status');
        aiAvailable = false;
    }
}

function updateAIStatusDisplay() {
    const statusDiv = document.getElementById('ollamaStatus');
    if (!statusDiv) return;
    
    if (aiAvailable) {
        statusDiv.className = 'ollama-status available';
        statusDiv.innerHTML = '✅ AI Ready';
    } else {
        statusDiv.className = 'ollama-status unavailable';
        statusDiv.innerHTML = '⚠️ AI not available';
    }
}

function toggleChatWindow() {
    const chatWindow = document.getElementById('aiChatWindow');
    chatWindow.classList.toggle('hidden');
    
    if (!chatWindow.classList.contains('hidden')) {
        document.getElementById('aiChatInput').focus();
    }
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    input.value = '';
    addChatMessage(message, 'user');
    showTypingIndicator();
    
    try {
        const response = await axios.post('/api/ai-chat', { message: message });
        removeTypingIndicator();
        
        const data = response.data;
        addChatMessage(data.response, 'assistant', data.source);
        
        if (data.search_results && data.search_results.length > 0) {
            addSearchResults(data.search_results);
        }
        
        if (data.msa_results && data.msa_results.length > 0) {
            addMSAResults(data.msa_results);
        }
        
    } catch (error) {
        removeTypingIndicator();
        addChatMessage('Sorry, there was an error. Please try again.', 'assistant', 'error');
    }
}

function addChatMessage(text, sender, source = '') {
    const messagesDiv = document.getElementById('aiChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    let contentHTML = `<div class="message-content ${sender}">${escapeHtml(text)}`;
    if (source && sender === 'assistant') {
        contentHTML += `<div class="message-source">Source: ${source}</div>`;
    }
    contentHTML += '</div>';
    
    messageDiv.innerHTML = contentHTML;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator() {
    const messagesDiv = document.getElementById('aiChatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="message-content assistant">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) typingDiv.remove();
}

function addSearchResults(results) {
    const messagesDiv = document.getElementById('aiChatMessages');
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'chat-message assistant';
    
    let resultHTML = '<div class="message-content assistant"><div class="message-results"><strong>📰 Web Results:</strong>';
    results.forEach((result, index) => {
        resultHTML += `
            <div class="search-result-item">
                <strong>${index + 1}. ${escapeHtml(result.title)}</strong><br>
                ${escapeHtml(result.summary)}<br>
                <a href="${escapeHtml(result.url)}" target="_blank">Read more →</a>
            </div>
        `;
    });
    resultHTML += '</div></div>';
    
    resultsDiv.innerHTML = resultHTML;
    messagesDiv.appendChild(resultsDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addMSAResults(results) {
    const messagesDiv = document.getElementById('aiChatMessages');
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'chat-message assistant';
    
    let resultHTML = '<div class="message-content assistant"><div class="message-results"><strong>📊 MSA Results:</strong>';
    results.forEach((result, index) => {
        resultHTML += `
            <div class="search-result-item">
                <strong>${index + 1}. ${escapeHtml(result.name)}</strong><br>
                Score: ${Number(result.score).toFixed(2)} | Pop: ${formatNumber(result.population)}
            </div>
        `;
    });
    resultHTML += '</div></div>';
    
    resultsDiv.innerHTML = resultHTML;
    messagesDiv.appendChild(resultsDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHtml(text) {
    const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
    return text.replace(/[&<>"']/g, m => map[m]);
}

document.addEventListener('DOMContentLoaded', function () {
    checkAIStatus();
});

console.log('✅ Script loaded with AI support');

