// -----------
// 1) Création de la carte Leaflet
// -----------
const map = L.map('map').setView([46.8, 2.5], 6); // centre France

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


// -----------
// 2) Chemin vers le CSV
// -----------
const CSV_PATH = "data.csv";  // à adapter si tu le mets ailleurs


// -----------
// 3) Lecture du CSV avec PapaParse
// -----------
Papa.parse(CSV_PATH, {
  download: true,       // charge le fichier sur le serveur local
  header: true,         // lit la 1ère ligne comme en-têtes de colonnes
  skipEmptyLines: true, // ignore les lignes vides
  complete: function(results) {
    console.log("CSV chargé :", results.data.length, "lignes");
    addMarkers(results.data);
  }
});


// -----------
// 4) Conversion des lignes CSV en marqueurs sur la carte
// -----------
function addMarkers(rows) {

  rows.forEach(row => {

    // selon ton fichier : les colonnes sont "latitude" et "longitude"
    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);

    // ignorer les lignes sans coordonnées valides
    if (isNaN(lat) || isNaN(lon)) return;

    // création du marker
    const marker = L.marker([lat, lon]).addTo(map);

    // popup ultra-simple avec quelques infos (ex : nom du site + commune)
    const popupHtml = `
      <strong>${row.site_nom || "Nom inconnu"}</strong><br>
      Commune : ${row.comm_nom || "n.d."}<br>
      Statut : ${row.site_statut || "n.d."}
    `;

    marker.bindPopup(popupHtml);
  });
}
