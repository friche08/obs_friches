/* 1. Initialisation */
const bounds = L.latLngBounds([48, 1], [52, 8]);
const map = L.map('map', {
    minZoom: 8,
    maxZoom: 18,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
}).setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* 2. Variables Globales */
let allData = [];
let markers = [];
const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

/* 3. Chargement des données */
Papa.parse('data.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        allData = results.data.filter(d => d.lat && d.lon);
        initFilters();
    }
});

/* 4. Logique des filtres */
function initFilters() {
    // Remplissage EPCI
    const epcis = [...new Set(allData.map(d => d.epci_nom))].filter(Boolean).sort();
    epcis.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e; opt.textContent = e;
        selEpci.appendChild(opt);
    });

    // Calcul Surface Max
    const surfaces = allData.map(d => parseFloat(d.site_surface_m2) || 0);
    const maxVal = Math.max(...surfaces);
    document.getElementById('surface-max').value = Math.ceil(maxVal / 1000) * 1000;

    // Écouteurs
    [selEpci, selCommune, selFriche].forEach(s => s.addEventListener('change', updateMap));
    
    const inputs = document.querySelectorAll('#filters-panel input');
    inputs.forEach(i => {
        i.addEventListener('change', updateMap);
        if (i.type === 'number') i.addEventListener('keyup', updateMap);
    });

    updateMap(); // Premier affichage
}

function updateMap() {
    const epci = selEpci.value;
    const minS = parseFloat(document.getElementById('surface-min').value) || 0;
    const maxS = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedStatuts = Array.from(document.querySelectorAll('.checkbox-list input:checked')).map(c => c.value);

    const filtered = allData.filter(d => {
        const s = parseFloat(d.site_surface_m2) || 0;
        return (epci === '' || d.epci_nom === epci) &&
               (s >= minS && s <= maxS) &&
               (checkedStatuts.includes(d.site_statut));
    });

    createMarkers(filtered);
}

/* 5. Marqueurs & Popups */
function createMarkers(data) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    data.forEach(row => {
        const colorMap = {
            'friche potentielle': '#7a5a3a',
            'friche sans projet': '#e1000f',
            'friche avec projet': '#000091',
            'friche reconvertie': '#00ac8c'
        };
        
        const marker = L.marker([row.lat, row.lon], {
            icon: L.divIcon({
                className: 'custom-icon',
                html: `<svg width="30" height="30"><circle cx="15" cy="15" r="10" fill="${colorMap[row.site_statut] || '#333'}" stroke="white" stroke-width="2"/></svg>`,
                iconSize: [30, 30], iconAnchor: [15, 15]
            })
        });

        const imagePath = `photos/${row.site_id}.jpg`;
        const surf = row.site_surface_m2 ? `${parseInt(row.site_surface_m2).toLocaleString()} m²` : 'Inconnue';

        marker.bindPopup(`
            <div class="popup-container">
                <div class="popup-title"><strong>${row.site_nom || 'Sans nom'}</strong></div>
                <div style="font-size:0.9em; color:#666;">${row.commune_nom}</div>
                <hr style="border:0; border-top:1px solid #ccc; margin:8px 0;">
                <img src="${imagePath}" style="width:100%; border-radius:4px;" onerror="this.style.display='none'">
                <div style="margin-top:10px; line-height:1.4;">
                    <div><strong>Statut :</strong> ${row.site_statut}</div>
                    <div><strong>Surface :</strong> ${surf}</div>
                </div>
            </div>`, { minWidth: 280 });

        marker.addTo(map);
        markers.push(marker);
    });
}

/* 6. UI Panneau */
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters')?.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.add('open');
});
document.getElementById('close-filters')?.addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => panel.classList.remove('open'));
