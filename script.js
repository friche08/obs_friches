// -----------------------------------------------------------------------------
// 1) Création de la carte Leaflet
// -----------------------------------------------------------------------------
const map = L.map('map').setView([49.7, 4.7], 9); // centre Ardennes

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// -----------------------------------------------------------------------------
// 2) Chemin vers le CSV
// -----------------------------------------------------------------------------
const CSV_PATH = "data.csv";


// -----------------------------------------------------------------------------
// 3) Lecture du CSV avec PapaParse
// -----------------------------------------------------------------------------
Papa.parse(CSV_PATH, {
  download: true,       // charge le fichier CSV
  header: true,         // lit la première ligne comme en-tête
  skipEmptyLines: true, // ignore les lignes vides
  complete: function(results) {
    console.log("CSV chargé :", results.data.length, "lignes");
    addMarkers(results.data);
  }
});


// -----------------------------------------------------------------------------
// 4) Fonction : renvoie une couleur selon la valeur "site_statut"
// -----------------------------------------------------------------------------
function getColorForStatus(status) {
  const colors = {
    "friche potentielle": "#aea397",
    "friche sans projet": "#745b47",
    "friche avec projet": "#2b7756",
    "friche reconvertie": "#99c221"
  };
  return colors[status] || "#777777"; // couleur par défaut si inconnue
}


// -----------------------------------------------------------------------------
// 5) Fonction : génère le SVG du pictogramme (avec la bonne couleur)
// -----------------------------------------------------------------------------
function createSvgPicto(pictocol) {
  return `
<svg width="19.2" height="19.2" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <rect x="3.6" y="3.6" width="12" height="12" rx="3"
        fill="${pictocol}" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">

    <!-- Animations lors du survol -->
    <animate attributeName="x" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
    <animate attributeName="y" dur="0.4s" begin="mouseover" from="3.6" to="1.6" fill="freeze"/>
    <animate attributeName="width" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
    <animate attributeName="height" dur="0.4s" begin="mouseover" from="12" to="16" fill="freeze"/>
    <animate attributeName="stroke-width" dur="0.4s" begin="mouseover" from="1.6" to="3.2" fill="freeze"/>

    <!-- Retour à l'état normal -->
    <animate attributeName="x" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
    <animate attributeName="y" dur="0.4s" begin="mouseout" from="1.6" to="3.6" fill="freeze"/>
    <animate attributeName="width" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
    <animate attributeName="height" dur="0.4s" begin="mouseout" from="16" to="12" fill="freeze"/>
    <animate attributeName="stroke-width" dur="0.4s" begin="mouseout" from="3.2" to="1.6" fill="freeze"/>

  </rect>
</svg>`;
}


// -----------------------------------------------------------------------------
// 6) Fonction : transforme le SVG en icône Leaflet (divIcon)
// -----------------------------------------------------------------------------
function createPictoIcon(svg) {
  return L.divIcon({
    className: "picto",      // utile si tu veux ajouter du CSS
    html: svg,               // contenu du pictogramme
    iconSize: [19.2, 19.2],  // taille du SVG
    iconAnchor: [9.6, 9.6],  // centre du pictogramme
    popupAnchor: [0, -10]    // décalage du popup
  });
}


// -----------------------------------------------------------------------------
// 7) Fonction : conversion des lignes CSV en marqueurs sur la carte
// -----------------------------------------------------------------------------
function addMarkers(rows) {

  rows.forEach(row => {

    // récupération des coordonnées dans le CSV
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);

    // ignorer les lignes sans coordonnées valides
    if (isNaN(lat) || isNaN(lon)) return;

    // couleur du statut
    const pictocol = getColorForStatus(row.site_statut);

    // SVG + icône Leaflet
    const svgpicto = createSvgPicto(pictocol);
    const picto = createPictoIcon(svgpicto);

    // création du marker avec icône personnalisée
    const marker = L.marker([lat, lon], {
      icon: picto,
      title: row.site_nom,   // info-bulle navigateur
      riseOnHover: true      // le marker passe au-dessus au survol
    }).addTo(map);

    // contenu du popup
    const popupHtml = `
      <strong>${row.site_nom || "Nom inconnu"}</strong><br>
      Commune : ${row.comm_nom || "n.d."}<br>
      Statut : ${row.site_statut || "n.d."}
    `;

    marker.bindPopup(popupHtml);
  });
}
