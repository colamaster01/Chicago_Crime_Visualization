export const API = {
    allData: [],
    mappings: {},
    isLoaded: false,
    
    // Crossfilter 核心实例与索引
    cf: null,
    dims: {},
    groups: {},

    // ==========================================
    // 1. 初始化：吃透数据并建立 Crossfilter 索引
    // ==========================================
    async init() {
        console.log("⏳ 正在将数据载入内存并建立 Crossfilter 索引...");
        try {
            const jsonRes = await fetch('crime_mapping.json');
            this.mappings = await jsonRes.json();

            const csvRes = await fetch('chicago_crimes_7years_compressed.csv');
            const csvText = await csvRes.text();
            
            const lines = csvText.split('\n');
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const p = lines[i].split(',');
                this.allData.push({
                    lat: parseFloat(p[0]), lng: parseFloat(p[1]),
                    y: parseInt(p[2]), m: parseInt(p[3]), d: parseInt(p[4]), h: parseInt(p[5]),
                    ca: parseInt(p[6]),
                    t: parseInt(p[7]),
                    desc: parseInt(p[8])
                });
            }

            // 【魔法开始】：初始化 Crossfilter 实例
            this.cf = crossfilter(this.allData);

            // 创建 5 个核心维度 (Dimensions)
            this.dims.year = this.cf.dimension(d => d.y);
            this.dims.month = this.cf.dimension(d => d.m);
            this.dims.hour = this.cf.dimension(d => d.h);
            this.dims.type = this.cf.dimension(d => d.t);
            this.dims.ca = this.cf.dimension(d => d.ca);

            // 创建对应的统计分组 (Groups)，用于极速生成柱状图和热力图
            this.groups.year = this.dims.year.group();
            this.groups.month = this.dims.month.group();
            this.groups.hour = this.dims.hour.group();
            this.groups.ca = this.dims.ca.group();

            this.isLoaded = true;
            console.log(`✅ Crossfilter 索引建立完毕！共 ${this.cf.size()} 条案件。`);
        } catch (e) {
            console.error("❌ 数据加载失败", e);
        }
    },

    // ==========================================
    // 2. 状态同步：将 UI 的过滤条件注入 Crossfilter
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

    updateCrossfilterState(filters) {
        // 1. 类型过滤 (使用 filterFunction)
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
        if (allowedTypes.size === 0) {
            this.dims.type.filter(-1); // 如果什么都没勾，传入一个不存在的 ID 以清空数据
        } else {
            this.dims.type.filterFunction(t => allowedTypes.has(t));
        }

        // 2. 时间过滤 (使用 filterRange)
        // 注意：Crossfilter 的 filterRange 是 [包含, 不包含)，所以上限要 +1
        if (filters.year) this.dims.year.filterRange([filters.year[0], filters.year[1] + 1]);
        else this.dims.year.filterAll();

        if (filters.month) this.dims.month.filterRange([filters.month[0], filters.month[1] + 1]);
        else this.dims.month.filterAll();

        if (filters.hour) this.dims.hour.filterRange([filters.hour[0], filters.hour[1] + 1]);
        else this.dims.hour.filterAll();
    },

    // ==========================================
    // 3. 散点数据 (微观图层)
    // ==========================================
    async fetchCrimes(filters, bounds) {
        if (!this.isLoaded || !bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        
        // 瞬间应用所有过滤条件
        this.updateCrossfilterState(filters);
        
        // 获取所有符合当前条件的记录（微秒级）
        // 可以调用任何维度的 top() 方法，它会返回受全局过滤影响的剩余数据
        const filteredRecords = this.dims.type.top(Infinity); 
        
        const features = [];
        const [south, north, west, east] = [bounds.getSouth(), bounds.getNorth(), bounds.getWest(), bounds.getEast()];

        // 空间过滤 (只针对已经筛出来的这一小部分数据做边界判断)
        for (let i = 0; i < filteredRecords.length; i++) {
            const d = filteredRecords[i];
            if (d.lat < south || d.lat > north || d.lng < west || d.lng > east) continue;

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

        if (!window.cachedCommunityGeoJson) {
            const geoRes = await fetch('https://data.cityofchicago.org/resource/igwz-8jzy.geojson');
            window.cachedCommunityGeoJson = await geoRes.json();
        }
        const geoJson = JSON.parse(JSON.stringify(window.cachedCommunityGeoJson));

        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            geoJson.features.forEach(f => f.properties.crime_count = 0);
            return { geoJson, thresholds: { p20: 1, p40: 2, p60: 3, p80: 4 }, isEmpty: true };
        }

        // 同步状态后，直接向 caGroup 要数据，它已经帮你算好了每个社区的总数！
        this.updateCrossfilterState(filters);
        const groupedData = this.groups.ca.all(); // 结果如 [{key: 1, value: 500}, ...]
        
        // 转为便于查询的字典
        const caCounts = {};
        groupedData.forEach(g => { caCounts[g.key] = g.value; });

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

        if (p40 <= p20) p40 = p20 + 1;
        if (p60 <= p40) p60 = p40 + 1;
        if (p80 <= p60) p80 = p60 + 1;

        return { geoJson, thresholds: { p20, p40, p60, p80 }, isEmpty: countsArray.length === 0 };
    },

    // ==========================================
    // 5. 柱状图数据 (利用 Crossfilter 原生特性)
    // ==========================================
    async fetchHistograms(filters) {
        if (!this.isLoaded || !filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { year: new Map(), month: new Map(), hour: new Map() };
        }

        // 应用过滤条件
        this.updateCrossfilterState(filters);

        // 辅助函数：将 CF 的 [{key: 2020, value: 50}, ...] 转为原架构需要的 Map
        const cfGroupToMap = (group) => {
            const map = new Map();
            // group.all() 极其智能，它会自动忽略自身维度的 filter！
            group.all().forEach(d => map.set(d.key, d.value));
            return map;
        };

        return { 
            year: cfGroupToMap(this.groups.year), 
            month: cfGroupToMap(this.groups.month), 
            hour: cfGroupToMap(this.groups.hour) 
        };
    }
};