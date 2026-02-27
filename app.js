// ============================================================// ============================================================
// API Configuration
// ============================================================
const API_BASE = 
  // Use relative path when served from same domain (production)
  window.location.hostname.includes('printzmadsen.net') 
    ? 'https://lycia.onrender.com/api'
    : '/api'; 
    // Use Render backend URL in development


function getDeviceType() {
  const userAgent = navigator.userAgent;
if (/Mobi|Android/i.test(userAgent)) {
    return "Mobile";
  } else if (/Tablet|iPad/i.test(userAgent)) {
    return "Tablet";
  } else {
    return "Desktop";
  }
}

console.log(getDeviceType());

const isPhone = getDeviceType() === "Mobile";

const MAP_CONFIG = {
  lat: 36.55, 
  lng: 29.75, 
  zoom: isPhone ? 8 : 10
};


// ============================================================
// Map initialisation
// ============================================================
const map = L.map('map').setView([MAP_CONFIG.lat, MAP_CONFIG.lng], MAP_CONFIG.zoom);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

// Layer group to hold all markers
const markersLayer = L.layerGroup().addTo(map);

// ============================================================
// DOM references
// ============================================================
const addBtn         = document.getElementById('add-btn');
const logoutBtn      = document.getElementById('logout-btn');
const detailModal    = document.getElementById('detail-modal');
const detailClose    = document.getElementById('detail-close');
const detailImages   = document.getElementById('detail-images');
const detailDelete   = document.getElementById('detail-delete');
const uploadModal    = document.getElementById('upload-modal');
const uploadClose    = document.getElementById('upload-close');
const uploadForm     = document.getElementById('upload-form');
const inputImages    = document.getElementById('input-images');
const uploadStatus   = document.getElementById('upload-status');
const authModal      = document.getElementById('auth-modal');
const authClose      = document.getElementById('auth-close');
const authForm       = document.getElementById('auth-form');
const authPassphrase = document.getElementById('auth-passphrase');
const authError      = document.getElementById('auth-error');

// Currently-viewed marker id (for deletion)
let activeMarkerId = null;

// ============================================================
// Authentication state
// ============================================================
let authToken = localStorage.getItem('authToken');

function isAuthenticated() {
  return !!authToken;
}

function setAuthToken(token) {
  authToken = token;
  localStorage.setItem('authToken', token);
  updateAuthUI();
}

function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('authToken');
  updateAuthUI();
}

function updateAuthUI() {
  const els = document.querySelectorAll('.auth-hidden');
  els.forEach(el => {
    if (isAuthenticated()) {
      el.classList.remove('auth-hidden');
      el.dataset.authed = '1';
    } else {
      el.classList.add('auth-hidden');
      delete el.dataset.authed;
    }
  });

  if (!isAuthenticated()) {
    [logoutBtn, detailDelete].forEach(el => {
      el.classList.add('auth-hidden');
    });
  }
}

// ============================================================
// Modal helpers
// ============================================================
function openModal(el) {
  el.classList.remove('hidden');
}

function closeModal(el) {
  el.classList.add('hidden');
}

detailClose.addEventListener('click', () => closeModal(detailModal));
uploadClose.addEventListener('click', () => closeModal(uploadModal));
authClose.addEventListener('click', () => closeModal(authModal));

[detailModal, uploadModal, authModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal(detailModal);
    closeModal(uploadModal);
    closeModal(authModal);
  }
});

// ============================================================
// Open upload form (with auth gate)
// ============================================================
addBtn.addEventListener('click', () => {
  if (!isAuthenticated()) {
    authError.classList.add('hidden');
    authPassphrase.value = '';
    openModal(authModal);
    return;
  }
  uploadForm.reset();
  uploadStatus.textContent = '';
  uploadStatus.classList.add('hidden');
  uploadStatus.classList.remove('error');
  openModal(uploadModal);
});

// ============================================================
// Auth form submission
// ============================================================
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: authPassphrase.value })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      authError.textContent = data.error || 'Login failed';
      authError.classList.remove('hidden');
      return;
    }

    const { token } = await res.json();
    setAuthToken(token);
    closeModal(authModal);
  } catch {
    authError.textContent = 'Network error';
    authError.classList.remove('hidden');
  }
});

// ============================================================
// Logout
// ============================================================
logoutBtn.addEventListener('click', () => {
  clearAuthToken();
  closeModal(detailModal);
  closeModal(uploadModal);
});

// ============================================================
// EXIF GPS extraction
// ============================================================

async function readExifGps(file) {
  try {
    const tags = await ExifReader.load(file); // Global from CDN

    console.log('EXIF tags:', tags);
    
    // Use expanded mode to get pre-calculated GPS values
    const tagsExpanded = await ExifReader.load(file, { expanded: true });
    
    if (tagsExpanded.gps?.Latitude && tagsExpanded.gps?.Longitude) {
      const lat = tagsExpanded.gps.Latitude;
      const lng = tagsExpanded.gps.Longitude;
      console.log('🎯 GPS via expanded:', { lat: lat.toFixed(6), lng: lng.toFixed(6) });
      return { lat, lng };
    }
    
    // Fallback to manual tag reading if expanded doesn't work
    if (!tags.GPSLatitude || !tags.GPSLongitude) return null;
        // Fallback to manual tag reading if expanded doesn't work
    if (!tags.GPSLatitude || !tags.GPSLongitude) {
      console.warn('⚠️ No GPS tags found in:', file.name);
      return null;
    }

    // Helper: convert EXIF rational [numerator, denominator] to decimal
    const rationalToDecimal = ([num, den]) => num / den;
    
    // Extract latitude components
    const latRationals = tags.GPSLatitude.value;
    const latDeg = rationalToDecimal(latRationals[0]);
    const latMin = rationalToDecimal(latRationals[1]);
    const latSec = rationalToDecimal(latRationals[2]);
    let lat = latDeg + latMin / 60 + latSec / 3600;
    
    // Extract longitude components
    const lngRationals = tags.GPSLongitude.value;
    const lngDeg = rationalToDecimal(lngRationals[0]);
    const lngMin = rationalToDecimal(lngRationals[1]);
    const lngSec = rationalToDecimal(lngRationals[2]);
    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    
    // Apply direction reference (N/S, E/W)
    const latRef = tags.GPSLatitudeRef?.value?.toUpperCase();
    const lngRef = tags.GPSLongitudeRef?.value?.toUpperCase();
    
    if (latRef === 'S') lat = -lat;
    if (lngRef === 'W') lng = -lng;
    
    console.log('🎯 EXIF GPS parsed:', { 
      lat: lat.toFixed(6), 
      lng: lng.toFixed(6),
      file: file.name 
    });
    
    return { lat, lng };
    
  } catch (err) {
    console.error('💥 ExifReader error:', err.message, 'for file:', file.name);
    return null;
  }
}


// ============================================================
// API helpers
// ============================================================
async function fetchMarkers() {
  const res = await fetch(`${API_BASE}/markers`);
  if (!res.ok) throw new Error('Failed to fetch markers', res.status);
  return res.json();
}

async function createMarker(formData) {
  const res = await fetch(`${API_BASE}/markers`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken },
    body: formData
  });
  if (res.status === 401) {
    clearAuthToken();
    throw new Error('Session expired. Please login again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create marker');
  }
  return res.json();
}

async function deleteMarker(id) {
  const res = await fetch(`${API_BASE}/markers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  if (res.status === 401) {
    clearAuthToken();
    throw new Error('Session expired. Please login again.');
  }
  if (!res.ok) throw new Error('Failed to delete marker');
  return res.json();
}

// ============================================================
// Render markers on the map
// ============================================================
function plotMarkers(markers) {
  markersLayer.clearLayers();

  markers.forEach((m) => {
    const leafletMarker = L.marker([m.lat, m.lng]).addTo(markersLayer);
    leafletMarker.bindTooltip(m.title);
    leafletMarker.on('click', () => showDetail(m));
  });
}

function showDetail(marker) {
  activeMarkerId = marker.id;

  detailImages.innerHTML = '';
  (marker.images || []).forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = marker.title || '';
    detailImages.appendChild(img);
  });

  openModal(detailModal);
}

function showDetail(marker) {
  activeMarkerId = marker.id;
  detailImages.innerHTML = '';
  
  // Determine the base URL for images
  const imageBase = window.location.hostname.includes('printzmadsen.net') 
    ? 'https://lycia.onrender.com' 
    : '';
  
  (marker.images || []).forEach((src) => {
    const img = document.createElement('img');
    // Prefix relative paths with backend URL when needed
    img.src = src.startsWith('http') ? src : imageBase + src;
    img.alt = marker.title || '';
    img.loading = 'lazy'; // Optional: improve performance
    detailImages.appendChild(img);
  });

  openModal(detailModal);
}

// ============================================================
// Delete handler
// ============================================================
detailDelete.addEventListener('click', async () => {
  if (!activeMarkerId) return;
  if (!confirm('Delete this marker?')) return;

  try {
    await deleteMarker(activeMarkerId);
    closeModal(detailModal);
    activeMarkerId = null;
    await loadAndPlot();
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// ============================================================
// Upload form submission — one marker per image using EXIF GPS
// ============================================================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = uploadForm.querySelector('button[type="submit"]');
  const files = inputImages.files;

  if (!files.length) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';
  uploadStatus.classList.remove('hidden', 'error');
  uploadStatus.textContent = 'Extracting GPS data from images...';

  try {
    let created = 0;
    let skipped = 0;
    const skippedNames = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadStatus.textContent = `Processing image ${i + 1} of ${files.length}...`;

      const gps = await readExifGps(file);

      console.log('GPS data:', gps);

      if (!gps) {
        skipped++;
        skippedNames.push(file.name);
        continue;
      }

      const formData = new FormData();
      formData.append('title', file.name);
      formData.append('lat', gps.lat.toFixed(6));
      formData.append('lng', gps.lng.toFixed(6));
      formData.append('images', file);

      console.log('Creating marker:', formData);

      const newMarker = await createMarker(formData);
      
      // 🎯 THIS IS THE LOG YOU WANT:
      console.log('✅ Marker created on server:', newMarker);
      console.log('🖼️ Image URL(s) returned:', newMarker.images);

      created++;
    }

    await loadAndPlot();

    if (skipped > 0 && created === 0) {
      uploadStatus.classList.add('error');
      uploadStatus.textContent = `No GPS data found in any image. Make sure your photos have location metadata.`;
    } else if (skipped > 0) {
      uploadStatus.textContent = `${created} marker(s) created. ${skipped} image(s) skipped (no GPS): ${skippedNames.join(', ')}`;
    } else {
      closeModal(uploadModal);
    }
  } catch (err) {
    uploadStatus.classList.add('error');
    uploadStatus.textContent = 'Error: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  }
});

// ============================================================
// Initial load
// ============================================================
async function loadAndPlot() {
  try {
    const markers = await fetchMarkers();
    plotMarkers(markers);
  } catch (err) {
    console.error('Failed to load markers:', err);
  }
}

loadAndPlot();
updateAuthUI();
