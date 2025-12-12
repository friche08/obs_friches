
// 1) Création de la carte Leaflet
const map = L.map('map').setView([49.7, 4.7], 9); // centre Ardennes

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// 2) Chemin vers le CSV
const CSV_PATH = "data.csv";


// 3) Lecture du CSV avec PapaParse
Papa.parse(CSV_PATH, {
  download: true,       // charge le fichier
  header: true,         // lit la 1ère ligne comme en-tête
  skipEmptyLines: true, // ignore les lignes vides
  complete: function(results) {
    console.log("CSV chargé :", results.data.length, "lignes");
    addMarkers(results.data);
  }
});


// 4) Conversion des lignes CSV en marqueurs sur la carte
function addMarkers(rows) {

  rows.forEach(row => {

    // colonnes "latitude" et "longitude"
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);

    // ignorer les lignes sans coordonnées valides
    if (isNaN(lat) || isNaN(lon)) return;

    // création du marker
    const marker = L.marker([lat, lon]).addTo(map);

    // création du popup
    const popupHtml = `
      <strong>${row.site_nom || "Nom inconnu"}</strong><br>
      Commune : ${row.comm_nom || "n.d."}<br>
      Statut : ${row.site_statut || "n.d."}
    `;

    marker.bindPopup(popupHtml);
  });
}
