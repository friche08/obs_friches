const map = L.map('map').setView([49.7, 4.7], 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let allData = [], markers = [];
const selEpci = document.getElementById('filter-epci'), 
      selCommune = document.getElementById('filter-commune'),
      selFriche = document.getElementById('filter-friche');

Papa.parse('data.csv', {
    download: true, header: true, skipEmptyLines: true,
    complete: function(results) {
        allData = results.data.filter(d => d.lat && d.lon);
        initFilters();
    }
});

function initFilters() {
    const fillSelect = (select, field) => {
        const vals = [...new Set(allData.map(d => d[field]))].filter(Boolean).sort();
        vals.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v; select.appendChild(opt);
        });
    };
    fillSelect(selEpci, 'epci_nom');
    fillSelect(selCommune, 'commune_nom');
    fillSelect(selFriche, 'site_nom');

    const surfaces = allData.map(d => parseFloat(d.site_surface_m2) || 0);
    document.getElementById('surface-max').value = Math.ceil(Math.max(...surfaces) / 1000) * 1000;

    document.querySelectorAll('#filters-panel input, #filters-panel select').forEach(el => {
        el.addEventListener('change', updateMap);
    });
    updateMap();
}

function updateMap() {
    const epci = selEpci.value, com = selCommune.value, fri = selFriche.value;
    const minS = parseFloat(document.getElementById('surface-min').value) || 0;
    const maxS = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checked = Array.from(document.querySelectorAll('.checkbox-list input:checked')).map(c => c.value);

    const filtered = allData.filter(d => {
        const s = parseFloat(d.site_surface_m2) || 0;
        return (epci==='' || d.epci_nom===epci) && (com==='' || d.commune_nom===com) &&
               (fri==='' || d.site_nom===fri) && (s>=minS && s<=maxS) && checked.includes(d.site_statut);
    });
    createMarkers(filtered);
}

function createMarkers(data) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const colors = {'friche potentielle':'#7a5a3a','friche sans projet':'#e1000f','friche avec projet':'#000091','friche reconvertie':'#00ac8c'};

    data.forEach(row => {
        const color = colors[row.site_statut] || '#333';
        // RE-INTEGRATION DE TON SVG ANIME ORIGINAL
        const iconHtml = `<svg width="30" height="30" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="10" fill="${color}" stroke="white" stroke-width="2">
                <animate attributeName="r" values="10;13;10" dur="2s" repeatCount="indefinite" begin="mouseover" end="mouseout"/>
            </circle>
        </svg>`;

        const marker = L.marker([row.lat, row.lon], {
            icon: L.divIcon({ className: 'custom-div-icon', html: iconHtml, iconSize:[30,30], iconAnchor:[15,15] })
        }).addTo(map);

        marker.bindPopup(`<strong>${row.site_nom}</strong><br>${row.commune_nom}<br>Surface: ${row.site_surface_m2} m²`);
        markers.push(marker);
    });
}

// UI Panneau
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters').onclick = (e) => { e.stopPropagation(); panel.classList.add('open'); };
document.getElementById('close-filters').onclick = () => panel.classList.remove('open');
map.onclick = () => panel.classList.remove('open');
