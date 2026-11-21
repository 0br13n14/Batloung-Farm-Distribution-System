const hqLatitude = process.env.HQ_LATITUDE?.trim() ? Number(process.env.HQ_LATITUDE) : Number.NaN;
const hqLongitude = process.env.HQ_LONGITUDE?.trim() ? Number(process.env.HQ_LONGITUDE) : Number.NaN;

export function hqDistanceKm(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (![hqLatitude, hqLongitude, Number(latitude), Number(longitude)].every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(Number(latitude) - hqLatitude);
  const longitudeDelta = radians(Number(longitude) - hqLongitude);
  const haversine = Math.min(1, Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(hqLatitude)) * Math.cos(radians(Number(latitude)))
    * Math.sin(longitudeDelta / 2) ** 2);
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 10) / 10;
}
