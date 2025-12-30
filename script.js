const bounds = L.latLngBounds([48, 1], [52, 8]);
const ZOOM_THRESHOLD = 13;
const CADASTRE_ZOOM_MIN = 14;

const map = L.map('map', {
    minZoom: 8,
    maxZoom: 18,
    maxBounds: bounds,
    maxBoundsViscosity: 1.0
}).setView([49.7, 4.7], 9);

// =======================
// FONDS DE CARTE
// =======================

// OSM standard
const osmStandard = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap', maxZoom: 19 }
);

// OSM Humanitaire (fond par défaut)
const osmHumanitarian = L.tileLayer(
  'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap – HOT', maxZoom: 19 }
);

// IGN – Carte Facile
const IGN_WMTS = 'https://data.geopf.fr/wmts';

const ignPlan = L.tileLayer(
  IGN_WMTS +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS' +
  '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  { attribution: '© IGN', maxZoom: 18 }
);

const ignOrtho = L.tileLayer(
  IGN_WMTS +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS' +
  '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  { attribution: '© IGN', maxZoom: 19 }
);

// Fond actif au chargement
osmHumanitarian.addTo(map);

// =======================
// SURCOUCHE CADASTRE
// =======================

const cadastre = L.tileLayer(
  IGN_WMTS +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=CADASTRALPARCELS.PARCELS' +
  '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
  { attribution: '© DGFiP / IGN', maxZoom: 20, opacity: 0.7 }
);

// =======================
// CONTROLE DES COUCHES
// =======================

L.control.layers(
  {
    "OSM standard": osmStandard,
    "OSM humanitaire": osmHumanitarian,
    "IGN – Carte": ignPlan,
    "IGN – Vue aérienne": ignOrtho
  },
  {
    "Cadastre": cadastre
  },
  { collapsed: true }
).addTo(map);

let allData = [];
let markers = [];
let markersDict = {};
let polygonsDict = {};
const polygonsLayerGroup = L.layerGroup().addTo(map);
const ardennesLayerGroup = L.layerGroup().addTo(map);

const selEpci = document.getElementById('filter-epci');
const selCommune = document.getElementById('filter-commune');
const selFriche = document.getElementById('filter-friche');

// 1. Marqueurs et Couleurs
function getColorForStatus(s) {
    const colors = {
        "friche potentielle": "#aea397",
        "friche sans projet": "#745b47",
        "friche avec projet": "#2b7756",
        "friche reconvertie": "#99c221"
    };
    return colors[s] || "#777";
}

function createSvgPicto(pictocol) {
    return `<svg width="19.2" height="19.2" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.6" y="3.6" width="12" height="12" rx="3"
        fill="${pictocol}" stroke="#ffffff" stroke-width="1.6"/>
    </svg>`;
}

// 2. Chargement des données
Papa.parse('data.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
        allData = results.data;
        loadArdennesOutline();
        loadGeoJsonData();
        addMarkers(allData);
        initCascadingFilters();
        updateFilterOptions();
    }
});

function addMarkers(rows) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];

    rows.forEach(row => {
        const lat = parseFloat(row.latitude);
        const lon = parseFloat(row.longitude);
        if (isNaN(lat)) return;

        const marker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: "picto",
                html: createSvgPicto(getColorForStatus(row.site_statut)),
                iconSize: [19.2, 19.2],
                iconAnchor: [9.6, 9.6]
            }),
            riseOnHover: true
        });

        marker.bindPopup(`<strong>${row.site_nom || 'Friche'}</strong>`);
        markers.push({ marker, data: row });
        if (row.site_id) markersDict[row.site_id] = marker;
    });
}

// 3. Zoom dynamique
function updateMap(shouldFit = false) {
    const showPolygons = map.getZoom() >= ZOOM_THRESHOLD;
    polygonsLayerGroup.clearLayers();

    markers.forEach(item => {
        if (!map.hasLayer(item.marker)) item.marker.addTo(map);
        if (showPolygons && polygonsDict[item.data.site_id]) {
            polygonsLayerGroup.addLayer(polygonsDict[item.data.site_id]);
        }
    });
}

// 4. Données Géo
function loadArdennesOutline() {
    fetch('ardennes.geojson')
      .then(r => r.json())
      .then(g => L.geoJSON(g, { interactive: false }).addTo(ardennesLayerGroup));
}

function loadGeoJsonData() {
    fetch('friches.geojson').then(r => r.json()).then(geojson => {
        L.geoJSON(geojson, {
            onEachFeature: (f, layer) => {
                const id = f.properties.site_id;
                if (id) polygonsDict[id] = layer;
            }
        });
        updateMap(false);
    });
}

// 5. Filtres & zoom
function initCascadingFilters() {
    map.on('zoomend', () => {
        updateMap(false);

        // Si le cadastre est coché mais zoom insuffisant → on le masque
        if (map.hasLayer(cadastre) && map.getZoom() < CADASTRE_ZOOM_MIN) {
            map.removeLayer(cadastre);
        }
    });
}

function updateFilterOptions() {
    updateMap(true);
}
