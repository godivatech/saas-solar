/**
 * Google-Level Performance Optimizer
 * Enterprise-grade caching and database optimization service
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

interface QueryMetrics {
  queryKey: string;
  executionTime: number;
  timestamp: number;
  cacheHit: boolean;
}

class PerformanceOptimizer {
  private cache = new Map<string, CacheEntry<any>>();
  private queryMetrics: QueryMetrics[] = [];
  private connectionPool = new Map<string, any>();
  private maxCacheSize = 1000;
  private defaultTTL = 300000; // 5 minutes
  
  // Intelligent cache with LRU eviction
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const now = Date.now();
    
    // Evict expired entries
    this.evictExpired();
    
    // Evict LRU if at capacity
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      timestamp: now,
      ttl,
      hits: 0
    });
    
    console.log(`PERF-CACHE: Cached ${key} with TTL ${ttl}ms`);
  }
  
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      console.log(`PERF-CACHE: Expired ${key}`);
      return null;
    }
    
    entry.hits++;
    console.log(`PERF-CACHE: Hit ${key} (${entry.hits} hits)`);
    return entry.data;
  }
  
  invalidate(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.cache.delete(key);
      console.log(`PERF-CACHE: Invalidated ${key}`);
    });
  }
  
  private evictExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
    if (expiredKeys.length > 0) {
      console.log(`PERF-CACHE: Evicted ${expiredKeys.length} expired entries`);
    }
  }
  
  private evictLRU(): void {
    let lruKey = '';
    let lruTimestamp = Date.now();
    let lruHits = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      const score = entry.hits / (Date.now() - entry.timestamp);
      if (score < (lruHits / (Date.now() - lruTimestamp))) {
        lruKey = key;
        lruTimestamp = entry.timestamp;
        lruHits = entry.hits;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      console.log(`PERF-CACHE: Evicted LRU ${lruKey}`);
    }
  }
  
  // Query optimization with metrics
  async executeOptimizedQuery<T>(
    queryKey: string, 
    queryFn: () => Promise<T>, 
    cacheTTL: number = this.defaultTTL,
    forceRefresh: boolean = false
  ): Promise<T> {
    const startTime = Date.now();
    
    // Check cache first
    if (!forceRefresh) {
      const cached = this.get<T>(queryKey);
      if (cached !== null) {
        this.recordMetrics(queryKey, Date.now() - startTime, true);
        return cached;
      }
    }
    
    // Execute query
    console.log(`PERF-QUERY: Executing ${queryKey}`);
    const result = await queryFn();
    const executionTime = Date.now() - startTime;
    
    // Cache result
    this.set(queryKey, result, cacheTTL);
    
    // Record metrics
    this.recordMetrics(queryKey, executionTime, false);
    
    console.log(`PERF-QUERY: Completed ${queryKey} in ${executionTime}ms`);
    return result;
  }
  
  private recordMetrics(queryKey: string, executionTime: number, cacheHit: boolean): void {
    this.queryMetrics.push({
      queryKey,
      executionTime,
      timestamp: Date.now(),
      cacheHit
    });
    
    // Keep only last 1000 metrics
    if (this.queryMetrics.length > 1000) {
      this.queryMetrics = this.queryMetrics.slice(-1000);
    }
  }
  
  // Performance analytics
  getPerformanceStats(): any {
    const now = Date.now();
    const recentMetrics = this.queryMetrics.filter(m => now - m.timestamp < 300000); // Last 5 minutes
    
    const totalQueries = recentMetrics.length;
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    const avgExecutionTime = recentMetrics.reduce((sum, m) => sum + m.executionTime, 0) / totalQueries || 0;
    const cacheHitRate = totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0;
    
    return {
      cacheSize: this.cache.size,
      totalQueries,
      cacheHits,
      cacheHitRate: Math.round(cacheHitRate),
      avgExecutionTime: Math.round(avgExecutionTime),
      activeCacheEntries: Array.from(this.cache.keys()).length
    };
  }
  
  // Preload critical data
  async preloadCriticalData(): Promise<void> {
    console.log('PERF-OPTIMIZER: Preloading critical data');
    
    // Preload department timings
    try {
      const { EnterpriseTimeService } = await import("./enterprise-time-service");
      await this.executeOptimizedQuery(
        'preload:department-timings',
        () => EnterpriseTimeService.getAllDepartmentTimings(),
        600000 // 10 minutes TTL
      );
    } catch (error) {
      console.error('PERF-OPTIMIZER: Failed to preload department timings:', error);
    }
  }
  
  // Clear all cache
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`PERF-CACHE: Cleared ${size} cache entries`);
  }
}

export const performanceOptimizer = new PerformanceOptimizer();

// Initialize preloading
performanceOptimizer.preloadCriticalData();