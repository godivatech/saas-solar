/**
 * Enterprise Performance Monitoring Service
 * Microsoft-grade real-time performance tracking and alerting
 */

export interface PerformanceMetrics {
  locationAccuracy: {
    average: number;
    minimum: number;
    maximum: number;
    distribution: Record<string, number>;
  };
  responseTime: {
    average: number;
    p95: number;
    p99: number;
  };
  success_rate: number;
  error_rate: number;
  timestamp: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  services: {
    geolocation: 'operational' | 'degraded' | 'down';
    database: 'operational' | 'degraded' | 'down';
    authentication: 'operational' | 'degraded' | 'down';
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: Date;
  }>;
}

export class EnterprisePerformanceMonitor {
  private static metrics: PerformanceMetrics[] = [];
  private static readonly MAX_METRICS_HISTORY = 1000;
  private static readonly ALERT_THRESHOLDS = {
    ERROR_RATE: 0.05, // 5%
    RESPONSE_TIME_P95: 2000, // 2 seconds
    LOCATION_ACCURACY: 1000 // 1km
  };

  static recordLocationValidation(
    accuracy: number,
    responseTime: number,
    success: boolean
  ): void {
    const timestamp = new Date();
    
    // Update metrics
    this.updateMetrics({
      accuracy,
      responseTime,
      success,
      timestamp
    });

    // Check for alerts
    this.checkAlerts();
  }

  static getSystemHealth(): SystemHealth {
    const recentMetrics = this.getRecentMetrics();
    const averageAccuracy = recentMetrics.reduce((sum, m) => sum + (m.locationAccuracy?.average || 0), 0) / recentMetrics.length;
    const errorRate = this.calculateErrorRate(recentMetrics);
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + (m.responseTime?.average || 0), 0) / recentMetrics.length;

    const alerts: SystemHealth['alerts'] = [];
    
    // Performance alerts
    if (errorRate > this.ALERT_THRESHOLDS.ERROR_RATE) {
      alerts.push({
        level: 'critical',
        message: `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
        timestamp: new Date()
      });
    }

    if (avgResponseTime > this.ALERT_THRESHOLDS.RESPONSE_TIME_P95) {
      alerts.push({
        level: 'warning',
        message: `Slow response times: ${avgResponseTime.toFixed(0)}ms average`,
        timestamp: new Date()
      });
    }

    if (averageAccuracy > this.ALERT_THRESHOLDS.LOCATION_ACCURACY) {
      alerts.push({
        level: 'warning',
        message: `Poor location accuracy: ${averageAccuracy.toFixed(0)}m average`,
        timestamp: new Date()
      });
    }

    // Determine overall status
    let status: SystemHealth['status'] = 'healthy';
    if (alerts.some(a => a.level === 'critical')) {
      status = 'critical';
    } else if (alerts.some(a => a.level === 'warning')) {
      status = 'degraded';
    }

    return {
      status,
      services: {
        geolocation: averageAccuracy > 2000 ? 'degraded' : 'operational',
        database: avgResponseTime > 3000 ? 'degraded' : 'operational',
        authentication: 'operational'
      },
      alerts
    };
  }

  static getPerformanceMetrics(): PerformanceMetrics | null {
    const recent = this.getRecentMetrics();
    if (recent.length === 0) return null;

    const accuracies = recent.map(m => m.locationAccuracy?.average || 0).filter(a => a > 0);
    const responseTimes = recent.map(m => m.responseTime?.average || 0).filter(rt => rt > 0);
    const successCount = recent.filter(m => m.success_rate > 0.9).length;

    return {
      locationAccuracy: {
        average: accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length || 0,
        minimum: Math.min(...accuracies) || 0,
        maximum: Math.max(...accuracies) || 0,
        distribution: this.calculateAccuracyDistribution(accuracies)
      },
      responseTime: {
        average: responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length || 0,
        p95: this.calculatePercentile(responseTimes, 0.95),
        p99: this.calculatePercentile(responseTimes, 0.99)
      },
      success_rate: successCount / recent.length,
      error_rate: 1 - (successCount / recent.length),
      timestamp: new Date()
    };
  }

  private static updateMetrics(data: {
    accuracy: number;
    responseTime: number;
    success: boolean;
    timestamp: Date;
  }): void {
    const metric: PerformanceMetrics = {
      locationAccuracy: {
        average: data.accuracy,
        minimum: data.accuracy,
        maximum: data.accuracy,
        distribution: {}
      },
      responseTime: {
        average: data.responseTime,
        p95: data.responseTime,
        p99: data.responseTime
      },
      success_rate: data.success ? 1 : 0,
      error_rate: data.success ? 0 : 1,
      timestamp: data.timestamp
    };

    this.metrics.push(metric);

    // Cleanup old metrics
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }
  }

  private static getRecentMetrics(): PerformanceMetrics[] {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > fiveMinutesAgo);
  }

  private static calculateErrorRate(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.error_rate, 0) / metrics.length;
  }

  private static calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index] || 0;
  }

  private static calculateAccuracyDistribution(accuracies: number[]): Record<string, number> {
    const distribution: Record<string, number> = {
      'excellent': 0,
      'good': 0,
      'fair': 0,
      'poor': 0
    };

    accuracies.forEach(accuracy => {
      if (accuracy <= 5) distribution.excellent++;
      else if (accuracy <= 20) distribution.good++;
      else if (accuracy <= 100) distribution.fair++;
      else distribution.poor++;
    });

    return distribution;
  }

  private static checkAlerts(): void {
    const health = this.getSystemHealth();
    
    // Log critical alerts
    health.alerts
      .filter(alert => alert.level === 'critical')
      .forEach(alert => {
        console.error(`ENTERPRISE-MONITOR [CRITICAL]: ${alert.message}`);
      });

    // Log warnings
    health.alerts
      .filter(alert => alert.level === 'warning')
      .forEach(alert => {
        console.warn(`ENTERPRISE-MONITOR [WARNING]: ${alert.message}`);
      });
  }
}