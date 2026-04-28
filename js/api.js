export const API = {
    allData: [],      // 存放所有案件的内存数组
    mappings: {},     // 存放 ID 到文本的翻译字典
    isLoaded: false,

    // ==========================================
    // 1. 初始化：吃透你的 CSV 和 JSON
    // ==========================================
    async init() {
        console.log("⏳ 正在将 7 年犯罪数据载入内存...");
        try {
            const jsonRes = await fetch('crime_mapping.json');
            this.mappings = await jsonRes.json();

            const csvRes = await fetch('chicago_crimes_7years_compressed.csv');
            const csvText = await csvRes.text();
            
            const lines = csvText.split('\n');
            // 根据你的 Python 脚本输出，列的顺序是: lat, lng, y, m, d, h, ca, t, desc
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const p = lines[i].split(',');
                this.allData.push({
                    lat: parseFloat(p[0]), lng: parseFloat(p[1]),
                    y: parseInt(p[2]), m: parseInt(p[3]), d: parseInt(p[4]), h: parseInt(p[5]),
                    ca: parseInt(p[6]), // 社区编号 Community Area
                    t: parseInt(p[7]),  // 类型 ID
                    desc: parseInt(p[8]) // 描述 ID
                });
            }
            this.isLoaded = true;
            console.log(`✅ 成功载入 ${this.allData.length} 条案件数据！`);
        } catch (e) {
            console.error("❌ 数据加载失败，请检查文件是否存在", e);
        }
    },

    // ==========================================
    // 2. 辅助函数：将勾选的字符串转为 ID 集合
    // ==========================================
    getAllowedTypeIds(crimeTypesStrArray) {
        const allowed = new Set();
        if (!crimeTypesStrArray || crimeTypesStrArray.length === 0) return allowed;

        const hasOther = crimeTypesStrArray.includes('OTHER');
        const explicitTypes = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE'];
        
        for (const [idStr, name] of Object.entries(this.mappings.types)) {
            const id = parseInt(idStr);
            if (crimeTypesStrArray.includes(name)) allowed.add(id);
            else if (hasOther && !explicitTypes.includes(name)) allowed.add(id);
        }
        return allowed;
    },

    matchTimeFilters(d, filters, excludeKey = null) {
        if (excludeKey !== 'year' && filters.year && (d.y < filters.year[0] || d.y > filters.year[1])) return false;
        if (excludeKey !== 'month' && filters.month && (d.m < filters.month[0] || d.m > filters.month[1])) return false;
        if (excludeKey !== 'hour' && filters.hour && (d.h < filters.hour[0] || d.h > filters.hour[1])) return false;
        return true;
    },

    // ==========================================
    // 3. 散点数据 (微观图层)
    // ==========================================
    async fetchCrimes(filters, bounds) {
        if (!this.isLoaded || !bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
        const features = [];
        const [south, north, west, east] = [bounds.getSouth(), bounds.getNorth(), bounds.getWest(), bounds.getEast()];

        for (let i = 0; i < this.allData.length; i++) {
            const d = this.allData[i];
            // 空间过滤 (如果在视野外直接跳过)
            if (d.lat < south || d.lat > north || d.lng < west || d.lng > east) continue;
            // 类型与时间过滤
            if (!allowedTypes.has(d.t) || !this.matchTimeFilters(d, filters)) continue;

            features.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: [d.lng, d.lat] },
                properties: { 
                    type: this.mappings.types[d.t] || 'UNKNOWN',
                    desc: this.mappings.descriptions[d.desc] || '',
                    date: `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')} ${String(d.h).padStart(2,'0')}:00`
                }
            });
        }
        return { type: "FeatureCollection", features };
    },

    // ==========================================
    // 4. 热力块数据 (宏观图层)
    // ==========================================
    async fetchMacroLayer(filters) {
        if (!this.isLoaded) return null;

        // 获取社区边界 GeoJSON (只请求一次并缓存)
        if (!window.cachedCommunityGeoJson) {
            const geoRes = await fetch('https://data.cityofchicago.org/resource/igwz-8jzy.geojson');
            window.cachedCommunityGeoJson = await geoRes.json();
        }
        const geoJson = JSON.parse(JSON.stringify(window.cachedCommunityGeoJson));

        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            geoJson.features.forEach(f => f.properties.crime_count = 0);
            return { geoJson, thresholds: { p20: 1, p40: 2, p60: 3, p80: 4 }, isEmpty: true };
        }

        // 内存中按社区(ca)进行 Count
        const caCounts = {};
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);

        for (let i = 0; i < this.allData.length; i++) {
            const d = this.allData[i];
            if (d.ca !== 0 && allowedTypes.has(d.t) && this.matchTimeFilters(d, filters)) {
                caCounts[d.ca] = (caCounts[d.ca] || 0) + 1;
            }
        }

        // 注入 GeoJSON 并计算颜色阈值分位数
        const countsArray = [];
        geoJson.features.forEach(f => {
            const areaId = parseInt(f.properties.area_num_1);
            const count = caCounts[areaId] || 0;
            f.properties.crime_count = count;
            if (count > 0) countsArray.push(count);
        });

        countsArray.sort((a, b) => a - b);
        let p20 = countsArray[Math.floor(countsArray.length * 0.2)] || 1;
        let p40 = countsArray[Math.floor(countsArray.length * 0.4)] || 2;
        let p60 = countsArray[Math.floor(countsArray.length * 0.6)] || 3;
        let p80 = countsArray[Math.floor(countsArray.length * 0.8)] || 4;

        // 保证分位数递增，防止地图渲染报错
        if (p40 <= p20) p40 = p20 + 1;
        if (p60 <= p40) p60 = p40 + 1;
        if (p80 <= p60) p80 = p60 + 1;

        return { geoJson, thresholds: { p20, p40, p60, p80 }, isEmpty: countsArray.length === 0 };
    },

    // ==========================================
    // 5. 柱状图数据 (利用反向排除法计算直方图)
    // ==========================================
    async fetchHistograms(filters) {
        const yearMap = new Map();
        const monthMap = new Map();
        const hourMap = new Map();

        if (!this.isLoaded || !filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { year: yearMap, month: monthMap, hour: hourMap };
        }

        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);

        // 扫一遍全量数据，各自跳过自己的维度进行计数
        for (let i = 0; i < this.allData.length; i++) {
            const d = this.allData[i];
            if (!allowedTypes.has(d.t)) continue;

            if (this.matchTimeFilters(d, filters, 'year')) {
                yearMap.set(d.y, (yearMap.get(d.y) || 0) + 1);
            }
            if (this.matchTimeFilters(d, filters, 'month')) {
                monthMap.set(d.m, (monthMap.get(d.m) || 0) + 1);
            }
            if (this.matchTimeFilters(d, filters, 'hour')) {
                hourMap.set(d.h, (hourMap.get(d.h) || 0) + 1);
            }
        }

        return { year: yearMap, month: monthMap, hour: hourMap };
    }
};