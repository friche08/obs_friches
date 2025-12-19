/* ------------------------------------------------------------------------- */
/* 1. Configuration & Initialisation                                         */
/* ------------------------------------------------------------------------- */
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

let allData = [];
let markers = [];
let markersDict = {};
const polygonsLayerGroup = L.layerGroup().addTo(map);

const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');
const inputSurfMax = document.getElementById('surface-max');

/* ------------------------------------------------------------------------- */
/* 2. Chargement des données                                                 */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        
        // Calcul du max de surface pour le placeholder / valeur par défaut
        const maxSurfaceFound = Math.max(...allData.map(d => d.unite_fonciere_surface || 0));
        inputSurfMax.value = Math.ceil(maxSurfaceFound / 1000) * 1000;

        addMarkers(allData);
        initCascadingFilters();
        initFilterListeners(); 
        updateMap(false); 
    }
});

/* ------------------------------------------------------------------------- */
/* 3. Logique de Filtrage                                                    */
/* ------------------------------------------------------------------------- */
function getFilteredData() {
    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;
    const checkedBoxes = document.querySelectorAll('.checkbox-list input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value);

    return allData.filter(d => {
        if (!allowedStatuses.includes(d.site_statut)) return false;
        const s = d.unite_fonciere_surface || 0;
        return (s >= surfMin && s <= surfMax);
    });
}

function initCascadingFilters() {
    updateFilterOptions();
    selEpci.addEventListener('change', updateFilterOptions);
    selCommune.addEventListener('change', updateFilterOptions);
    selFriche.addEventListener('change', () => updateMap(true));
}

function updateFilterOptions() {
    const baseData = getFilteredData();
    populateSelect(selEpci, baseData, 'epci_nom', '- Tous les EPCI -');

    const selectedEpci = selEpci.value;
    let filteredCommunes = baseData;
    if (selectedEpci) filteredCommunes = filteredCommunes.filter(d => d.epci_nom === selectedEpci);
    populateSelect(selCommune, filteredCommunes, 'comm_nom', '- Toutes les communes -');
    
    const selectedCommune = selCommune.value;
    let filteredFriches = filteredCommunes; 
    if (selectedCommune) filteredFriches = filteredFriches.filter(d => d.comm_nom === selectedCommune);
    populateSelect(selFriche, filteredFriches, 'site_nom', '- Toutes les friches -');
    
    updateMap(true);
}

function populateSelect(selectElement, dataList, key, defaultText) {
    const currentVal = selectElement.value;
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = val;
        selectElement.appendChild(opt);
    });
    if ([...selectElement.options].some(o => o.value === currentVal)) selectElement.value = currentVal;
}

function initFilterListeners() {
    document.querySelectorAll('.checkbox-list input, #surface-min, #surface-max').forEach(input => {
        input.addEventListener('change', updateFilterOptions);
        if(input.type === 'number') input.addEventListener('input', updateFilterOptions);
    });
}

function updateMap(shouldFitBounds = false) {
    const valEpci = selEpci.value;
    const valCommune = selCommune.value;
    const valFriche = selFriche.value;
    const baseFilteredData = getFilteredData(); 

    markers.forEach(item => {
        const d = item.data;
        let visible = baseFilteredData.includes(d);

        if (visible) {
            if (valEpci && d.epci_nom !== valEpci) visible = false;
            if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
            if (visible && valFriche && d.site_nom !== valFriche) visible = false;
        }

        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
        } else {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
        }
    });

    if (shouldFitBounds) fitMapToVisibleMarkers();
}

function fitMapToVisibleMarkers() {
    const visibleCoords = markers
        .filter(item => map.hasLayer(item.marker))
        .map(item => item.marker.getLatLng());
    if (visibleCoords.length > 0) {
        map.fitBounds(L.latLngBounds(visibleCoords), { padding: [40, 40], maxZoom: 15 });
    }
}

/* ------------------------------------------------------------------------- */
/* 4. Marqueurs SVG (CONSERVÉS À L'IDENTIQUE)                                */
/* ------------------------------------------------------------------------- */
function getColorForStatus(status) {
    const colors = {
        "friche potentielle": "#aea397",
        "friche sans projet": "#745b47",
        "friche avec projet": "#2b7756",
        "friche reconvertie": "#99c221"
    };
    return colors[status] || "#777777";
}

function createSvgPicto(pictocol) {
    return `<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.6" y="3.6" width="12" height="12" rx="3" fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
        <animate attributeName="x" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
        <animate attributeName="y" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
        <animate attributeName="width" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
        <animate attributeName="height" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
        <animate attributeName="stroke-width" dur="0.4s" begin="mouseover" from="1.6" to="3.2" fill="freeze"/>
        <animate attributeName="x" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
        <animate attributeName="y" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
        <animate attributeName="width" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
        <animate attributeName="height" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
        <animate attributeName="stroke-width" dur="0.4s" begin="mouseout" from="3.2" to="1.6" fill="freeze"/>
      </rect></svg>`;
}

function addMarkers(rows) {
    rows.forEach(row => {
        const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
        if (isNaN(lat) || isNaN(lon)) return;

        const marker = L.marker([lat, lon], {
            icon: L.divIcon({ 
                className: "picto", 
                html: createSvgPicto(getColorForStatus(row.site_statut)), 
                iconSize: [19.2, 19.2], 
                iconAnchor: [9.6, 9.6], 
                popupAnchor: [0, -10] 
            }),
            title: row.site_nom
        });

        // Formatage de la surface
        const surfaceFormatee = row.unite_fonciere_surface 
            ? new Intl.NumberFormat('fr-FR').format(row.unite_fonciere_surface) + ' m²' 
            : 'Non renseignée';

        const imagePath = `photos/${row.site_id}.webp`;
        const popupContent = `
            <div class="popup-container">
                <h3>${row.site_nom || 'Friche sans nom'}</h3>
                <span class="popup-commune">${row.comm_nom || ''}</span>
                <hr class="popup-sep">
                <img src="${imagePath}" class="popup-img" onerror="this.style.display='none'"/>
                <div class="popup-details">
                    <strong>Statut :</strong> ${row.site_statut}<br>
                    <strong>Surface :</strong> ${surfaceFormatee}
                </div>
            </div>`;

        marker.bindPopup(popupContent);
        markers.push({ marker, data: row });
    });
}

/* ------------------------------------------------------------------------- */
/* 5. UI Panneau                                                             */
/* ------------------------------------------------------------------------- */
const panel = document.getElementById('filters-panel');
document.getElementById('toggle-filters').addEventListener('click', (e) => { 
    e.stopPropagation(); 
    panel.classList.add('open'); 
});
document.getElementById('close-filters').addEventListener('click', () => panel.classList.remove('open'));
map.on('click', () => panel.classList.remove('open'));
