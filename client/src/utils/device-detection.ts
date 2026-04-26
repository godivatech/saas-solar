/**
 * Device Detection Utility for Enterprise Attendance System
 * Detects device type to apply appropriate location validation and UX
 */

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  isTouchDevice: boolean;
  platform: string;
  userAgent: string;
  screenWidth: number;
  hasGPS: boolean;
  locationCapability: 'excellent' | 'good' | 'limited' | 'poor';
}

export class DeviceDetection {
  /**
   * Get comprehensive device information
   */
  static getDeviceInfo(): DeviceInfo {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    const screenWidth = window.innerWidth;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Detect device type
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android.*Tablet|Windows.*Touch/i.test(userAgent) && screenWidth >= 768;
    
    let deviceType: 'mobile' | 'tablet' | 'desktop';
    if (isMobile && !isTablet && screenWidth < 768) {
      deviceType = 'mobile';
    } else if (isTablet || (isTouchDevice && screenWidth >= 768 && screenWidth <= 1024)) {
      deviceType = 'tablet';
    } else {
      deviceType = 'desktop';
    }
    
    // Determine GPS capability
    const hasGPS = deviceType === 'mobile' || (deviceType === 'tablet' && isMobile);
    
    let locationCapability: 'excellent' | 'good' | 'limited' | 'poor';
    if (deviceType === 'mobile') {
      locationCapability = 'excellent'; // Has GPS hardware
    } else if (deviceType === 'tablet') {
      locationCapability = 'good'; // May have GPS, good WiFi positioning
    } else if (isTouchDevice) {
      locationCapability = 'limited'; // Touch laptop, WiFi positioning
    } else {
      locationCapability = 'poor'; // Desktop, WiFi/IP positioning only
    }
    
    return {
      type: deviceType,
      isTouchDevice,
      platform,
      userAgent,
      screenWidth,
      hasGPS,
      locationCapability
    };
  }
  
  /**
   * Get expected GPS accuracy range for device type
   */
  static getExpectedAccuracy(deviceInfo?: DeviceInfo): { min: number; max: number; typical: number } {
    const device = deviceInfo || this.getDeviceInfo();
    
    switch (device.locationCapability) {
      case 'excellent': // Mobile with GPS
        return { min: 3, max: 20, typical: 10 };
      case 'good': // Tablet with GPS/WiFi
        return { min: 10, max: 50, typical: 25 };
      case 'limited': // Touch laptop with WiFi
        return { min: 50, max: 200, typical: 100 };
      case 'poor': // Desktop with WiFi/IP
        return { min: 100, max: 1000, typical: 300 };
      default:
        return { min: 50, max: 500, typical: 200 };
    }
  }
  
  /**
   * Get appropriate validation radius for device type
   */
  static getValidationRadius(baseRadius: number, deviceInfo?: DeviceInfo): number {
    const device = deviceInfo || this.getDeviceInfo();
    
    switch (device.locationCapability) {
      case 'excellent': // Mobile - strict validation
        return baseRadius;
      case 'good': // Tablet - slightly relaxed
        return baseRadius * 1.5;
      case 'limited': // Touch laptop - relaxed
        return baseRadius * 2.5;
      case 'poor': // Desktop - very relaxed
        return baseRadius * 3.0;
      default:
        return baseRadius * 2.0;
    }
  }
  
  /**
   * Get user-friendly location status message
   */
  static getLocationStatusMessage(accuracy: number, deviceInfo?: DeviceInfo): {
    message: string;
    color: 'success' | 'warning' | 'info' | 'error';
    technical: string;
  } {
    const device = deviceInfo || this.getDeviceInfo();
    const expected = this.getExpectedAccuracy(device);
    
    if (device.type === 'mobile') {
      // Mobile device - show user-friendly messages
      if (accuracy <= 10) {
        return {
          message: 'Perfect location found',
          color: 'success',
          technical: `Location accuracy: ${Math.round(accuracy)}m (Excellent)`
        };
      } else if (accuracy <= 50) {
        return {
          message: 'Location detected successfully',
          color: 'success', 
          technical: `Location accuracy: ${Math.round(accuracy)}m (Good)`
        };
      } else if (accuracy <= 200) {
        return {
          message: 'Location found (works fine indoors)',
          color: 'warning',
          technical: `Location accuracy: ${Math.round(accuracy)}m (Fair - Indoor OK)`
        };
      } else {
        return {
          message: 'Location signal is weak',
          color: 'error',
          technical: `Location accuracy: ${Math.round(accuracy)}m (Poor)`
        };
      }
    } else {
      // Desktop/Laptop - show user-friendly messages
      if (accuracy <= expected.typical) {
        return {
          message: 'You are at the office',
          color: 'success',
          technical: 'Office network location detected'
        };
      } else if (accuracy <= expected.max) {
        return {
          message: 'Location confirmed',
          color: 'info',
          technical: 'Using office network location'
        };
      } else {
        return {
          message: 'Having trouble finding your location',
          color: 'warning',
          technical: 'Office network location limited'
        };
      }
    }
  }
  
  /**
   * Get device-appropriate recommendations in user-friendly language
   */
  static getLocationRecommendations(accuracy: number, deviceInfo?: DeviceInfo): string[] {
    const device = deviceInfo || this.getDeviceInfo();
    const recommendations: string[] = [];
    
    if (device.type === 'mobile') {
      if (accuracy > 100) {
        recommendations.push('Try moving near a window for better signal');
        recommendations.push('Make sure location is turned on in your phone settings');
        recommendations.push('Step outside if you\'re in a basement or garage');
      } else if (accuracy > 50) {
        recommendations.push('Location signal is okay - move closer to windows if you\'re indoors');
      } else {
        recommendations.push('Great! Your location is working perfectly');
      }
    } else {
      // Desktop/Laptop recommendations
      if (accuracy > 500) {
        recommendations.push('Make sure you\'re connected to the office WiFi');
        recommendations.push('Check your internet connection');
        recommendations.push('Contact IT support if problems continue');
      } else {
        recommendations.push('Your office location is working normally');
      }
    }
    
    return recommendations;
  }
  
  /**
   * Check if device is likely to have poor GPS indoors
   */
  static isIndoorGPSExpected(deviceInfo?: DeviceInfo): boolean {
    const device = deviceInfo || this.getDeviceInfo();
    return device.type !== 'mobile'; // Non-mobile devices expected to have poor GPS
  }
  
  /**
   * Get validation confidence multiplier based on device
   */
  static getConfidenceMultiplier(accuracy: number, deviceInfo?: DeviceInfo): number {
    const device = deviceInfo || this.getDeviceInfo();
    const expected = this.getExpectedAccuracy(device);
    
    if (accuracy <= expected.typical) {
      return 1.0; // Full confidence
    } else if (accuracy <= expected.max) {
      return 0.8; // Reduced confidence but acceptable
    } else {
      return 0.6; // Low confidence
    }
  }
}

// Export convenience functions
export const getDeviceInfo = () => DeviceDetection.getDeviceInfo();
export const getLocationStatusMessage = (accuracy: number) => DeviceDetection.getLocationStatusMessage(accuracy);
export const getValidationRadius = (baseRadius: number) => DeviceDetection.getValidationRadius(baseRadius);
export const isIndoorGPSExpected = () => DeviceDetection.isIndoorGPSExpected();