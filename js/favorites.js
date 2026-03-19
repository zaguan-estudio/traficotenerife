/**
 * favorites.js — Gestión de cámaras favoritas en localStorage
 */

const FAV_KEY = 'ttf-favorites';

function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
  catch { return []; }
}

function isFav(camId) {
  return getFavs().includes(camId);
}

/** Añade o elimina camId. Devuelve true si fue añadida, false si fue eliminada. */
function toggleFav(camId) {
  const favs = getFavs();
  const idx  = favs.indexOf(camId);
  if (idx === -1) favs.push(camId);
  else            favs.splice(idx, 1);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  return idx === -1;
}
