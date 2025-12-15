/* ------------------------------------------------------------------------- */
/* 1. Initialisation                                                        */
/* ------------------------------------------------------------------------- */
const map = L.map('map').setView([49.7, 4.7], 9);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let allData = [];     // Données brutes
let markers = [];     // Stockage pour gestion affichage/filtrage

/* ------------------------------------------------------------------------- */
/* 2. Chargement des données                                                */
/* ------------------------------------------------------------------------- */
Papa.parse('data.csv', {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: function (results) {
    allData = results.data;
    
    // Initialisation des marqueurs (avec ton style SVG)
    addMarkers(allData);
    
    // Initialisation des listes déroulantes (Hiérarchie)
    initCascadingFilters();
    
    // Écouteurs pour le filtrage temps réel
    initFilterListeners();
    
    // Premier filtrage pour respecter les checkbox par défaut
    updateMap(); 
  }
});

/* ------------------------------------------------------------------------- */
/* 3. Fonctions SVG et Marqueurs (TON CODE INTÉGRÉ)                        */
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
  return `
<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.6" y="3.6" width="12" height="12" rx="3"
       fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
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
  </rect>
</svg>`;
}

function createPictoIcon(svg) {
  return L.divIcon({
    className: "picto",
    html: svg,
    iconSize: [19.2, 19.2],
    iconAnchor: [9.6, 9.6],
    popupAnchor: [0, -10]
  });
}

function addMarkers(rows) {
  // Nettoyage préalable si rappel de fonction
  markers.forEach(m => map.removeLayer(m.marker));
  markers = [];

  rows.forEach(row => {
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);

    if (isNaN(lat) || isNaN(lon)) return;

    const pictocol = getColorForStatus(row.site_statut);
    const svgpicto = createSvgPicto(pictocol);
    const picto = createPictoIcon(svgpicto);

    const marker = L.marker([lat, lon], {
      icon: picto,
      title: row.site_nom,
      riseOnHover: true
    });

    // Ajout Popup
    const surf = row.unite_fonciere_surface ? row.unite_fonciere_surface + ' m²' : 'Non connue';
    marker.bindPopup(`
        <strong>${row.site_nom || 'Friche'}</strong><br>
        ${row.comm_nom}<br>
        <span style="color:${pictocol}">⬤</span> ${row.site_statut}<br>
        Surface: ${surf}
    `);

    // AJOUT IMPORTANT : On ne l'ajoute pas direct à la carte (addTo(map)),
    // on le stocke dans le tableau 'markers' pour que le filtrage gère l'affichage.
    // (Mais on peut l'ajouter initialement et laisser le filtre faire le tri juste après).
    marker.addTo(map); 
    
    markers.push({
      marker: marker,
      data: row
    });
  });
}

/* ------------------------------------------------------------------------- */
/* 4. Logique de Filtres Hiérarchiques (Cascade)                            */
/* ------------------------------------------------------------------------- */

const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

function initCascadingFilters() {
    // 1. Remplir EPCI (niveau le plus haut)
    populateSelect(selEpci, allData, 'epci_nom');

    // 2. Écouteurs pour la cascade
    
    // Quand EPCI change -> Mettre à jour Communes
    selEpci.addEventListener('change', () => {
        updateCommuneOptions();
        updateFricheOptions(); // Reset friches aussi
        updateMap(); // Filtrage carte
    });

    // Quand Commune change -> Mettre à jour Friches
    selCommune.addEventListener('change', () => {
        updateFricheOptions();
        updateMap(); // Filtrage carte
    });

    // Quand Friche change -> Juste la carte
    selFriche.addEventListener('change', updateMap);
}

// Fonction utilitaire pour remplir un select
function populateSelect(selectElement, dataList, key) {
    // Garder l'option "Tous..."
    const defaultOption = selectElement.options[0];
    selectElement.innerHTML = '';
    selectElement.appendChild(defaultOption);

    const values = [...new Set(dataList.map(d => d[key]))].filter(Boolean).sort();
    
    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        selectElement.appendChild(opt);
    });
}

function updateCommuneOptions() {
    const selectedEpci = selEpci.value;
    
    // Si un EPCI est choisi, on ne garde que les communes de cet EPCI
    // Sinon (vide), on prend toutes les données
    const filteredData = selectedEpci 
        ? allData.filter(d => d.epci_nom === selectedEpci)
        : allData;

    populateSelect(selCommune, filteredData, 'comm_nom');
}

function updateFricheOptions() {
    const selectedEpci = selEpci.value;
    const selectedCommune = selCommune.value;

    let filteredData = allData;

    if (selectedEpci) {
        filteredData = filteredData.filter(d => d.epci_nom === selectedEpci);
    }
    if (selectedCommune) {
        filteredData = filteredData.filter(d => d.comm_nom === selectedCommune);
    }

    populateSelect(selFriche, filteredData, 'site_nom');
}

/* ------------------------------------------------------------------------- */
/* 5. Logique de Filtrage (Moteur)                                          */
/* ------------------------------------------------------------------------- */

function initFilterListeners() {
    // Checkboxes statuts
    document.querySelectorAll('fieldset input').forEach(input => {
        input.addEventListener('change', updateMap);
    });
    // Inputs surface
    document.getElementById('surface-min').addEventListener('input', updateMap);
    document.getElementById('surface-max').addEventListener('input', updateMap);
}

function updateMap() {
    // Récup valeurs
    const valEpci = selEpci.value;
    const valCommune = selCommune.value;
    const valFriche = selFriche.value;

    const surfMin = parseFloat(document.getElementById('surface-min').value) || 0;
    const surfMax = parseFloat(document.getElementById('surface-max').value) || Infinity;

    // Statuts cochés
    const checkedBoxes = document.querySelectorAll('fieldset input:checked');
    const allowedStatuses = Array.from(checkedBoxes).map(cb => cb.value); // ex: ['friche sans projet']

    markers.forEach(item => {
        const d = item.data;
        let visible = true;

        // 1. Filtres Listes
        if (valEpci && d.epci_nom !== valEpci) visible = false;
        if (visible && valCommune && d.comm_nom !== valCommune) visible = false;
        if (visible && valFriche && d.site_nom !== valFriche) visible = false;

        // 2. Filtre Statut (Exactement la demande : décoché = masqué)
        if (visible) {
            // Note: d.site_statut est la valeur du CSV. 
            // On compare avec le tableau des cases cochées.
            // .toLowerCase() par sécurité si besoin
            if (!allowedStatuses.includes(d.site_statut)) visible = false;
        }

        // 3. Filtre Surface
        const s = d.unite_fonciere_surface || 0;
        if (visible && (s < surfMin || s > surfMax)) visible = false;

        // Rendu
        if (visible) {
            if (!map.hasLayer(item.marker)) item.marker.addTo(map);
        } else {
            if (map.hasLayer(item.marker)) map.removeLayer(item.marker);
        }
    });
}

/* ------------------------------------------------------------------------- */
/* 6. UI Panneau Latéral                                                    */
/* ------------------------------------------------------------------------- */
const btnOpen = document.getElementById('toggle-filters');
const btnClose = document.getElementById('close-filters');
const panel = document.getElementById('filters-panel');

if (btnOpen && panel) {
    btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.add('open');
    });
}
if (btnClose && panel) {
    btnClose.addEventListener('click', () => {
        panel.classList.remove('open');
    });
}

// Fermeture au clic sur la carte
map.on('click', () => {
    panel.classList.remove('open');
});
