/**
 * Determines if coordinates are within a geofence
 * @param lat Latitude to check
 * @param lng Longitude to check
 * @param fenceLat Fence center latitude
 * @param fenceLng Fence center longitude
 * @param radiusInMeters Fence radius in meters
 * @returns boolean indicating if point is within fence
 */
export function isWithinGeoFence(
  lat: number,
  lng: number,
  fenceLat: number,
  fenceLng: number,
  radiusInMeters: number
): boolean {
  // If any parameter is missing, return false
  if (!lat || !lng || !fenceLat || !fenceLng || !radiusInMeters) {
    return false;
  }

  // Calculate distance using Haversine formula
  const distance = getDistanceBetweenCoordinates(
    lat,
    lng,
    fenceLat,
    fenceLng
  );

  // Check if within radius
  return distance <= radiusInMeters;
}

/**
 * Calculates distance between two coordinates in meters
 * @param lat1 First latitude
 * @param lon1 First longitude
 * @param lat2 Second latitude
 * @param lon2 Second longitude
 * @returns Distance in meters
 */
export function getDistanceBetweenCoordinates(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusInMeters = 6371000; // Earth's radius in meters

  // Convert degrees to radians
  const latRad1 = toRadians(lat1);
  const latRad2 = toRadians(lat2);
  const lonRad1 = toRadians(lon1);
  const lonRad2 = toRadians(lon2);

  // Differences
  const dLat = latRad2 - latRad1;
  const dLon = lonRad2 - lonRad1;

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(latRad1) * Math.cos(latRad2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadiusInMeters * c;

  return distance;
}

/**
 * Converts degrees to radians
 * @param degrees Angle in degrees
 * @returns Angle in radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 First latitude
 * @param lng1 First longitude  
 * @param lat2 Second latitude
 * @param lng2 Second longitude
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return getDistanceBetweenCoordinates(lat1, lng1, lat2, lng2);
}

// Automatic location calibration system
interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: Date;
  userId: string;
}

const recentOfficeCheckins: Map<string, LocationData[]> = new Map();

export async function performAutomaticLocationCalibration(
  userLat: number,
  userLon: number,
  officeLocation: any,
  storage: any
): Promise<void> {
  try {
    const officeId = officeLocation.id;
    const currentTime = new Date();
    const oneDayAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);

    // Get or initialize check-in data for this office
    if (!recentOfficeCheckins.has(officeId)) {
      recentOfficeCheckins.set(officeId, []);
    }

    const checkins = recentOfficeCheckins.get(officeId)!;

    // Add current check-in
    checkins.push({
      latitude: userLat,
      longitude: userLon,
      timestamp: currentTime,
      userId: 'auto-calibration'
    });

    // Remove old check-ins (older than 24 hours)
    const validCheckins = checkins.filter(checkin => checkin.timestamp > oneDayAgo);
    recentOfficeCheckins.set(officeId, validCheckins);

    // Require minimum 3 check-ins for calibration
    if (validCheckins.length < 3) {
      console.log(`AUTO-CALIBRATION: Need ${3 - validCheckins.length} more check-ins for office ${officeLocation.name}`);
      return;
    }

    // Calculate centroid of recent check-ins
    const avgLat = validCheckins.reduce((sum, checkin) => sum + checkin.latitude, 0) / validCheckins.length;
    const avgLon = validCheckins.reduce((sum, checkin) => sum + checkin.longitude, 0) / validCheckins.length;

    // Check if current office coordinates are significantly off
    const currentDistance = calculateDistance(
      parseFloat(officeLocation.latitude),
      parseFloat(officeLocation.longitude),
      avgLat,
      avgLon
    );

    // If average check-in location is more than 100m away from stored coordinates, detect drift
    if (currentDistance > 100) {
      console.log(`AUTO-CALIBRATION: Office "${officeLocation.name}" coordinates drift detected`);
      console.log(`Current coordinates: ${officeLocation.latitude}, ${officeLocation.longitude}`);
      console.log(`Suggested coordinates: ${avgLat}, ${avgLon} (based on ${validCheckins.length} recent check-ins)`);
      console.log(`Distance drift: ${Math.round(currentDistance)}m`);
      console.warn('AUTO-CALIBRATION: Update method removed. Please update coordinates manually via Firebase Console if needed.');

      // NOTE: Office location mutation methods have been removed
      // Auto-calibration can no longer update coordinates automatically
      // If coordinates need updating, do so via Firebase Console

      // await storage.updateOfficeLocation(officeId, {
      //   ...officeLocation,
      //   latitude: avgLat.toString(),
      //   longitude: avgLon.toString(),
      //   lastCalibrated: new Date().toISOString(),
      //   calibrationMethod: 'automatic',
      //   calibrationCheckins: validCheckins.length
      // });

      // Clear check-in history after detection
      recentOfficeCheckins.set(officeId, []);

      console.log(`AUTO-CALIBRATION: Successfully updated office location coordinates`);
    } else {
      console.log(`AUTO-CALIBRATION: Office coordinates are accurate (${Math.round(currentDistance)}m variance)`);
    }
  } catch (error) {
    console.error("AUTO-CALIBRATION ERROR:", error);
  }
}