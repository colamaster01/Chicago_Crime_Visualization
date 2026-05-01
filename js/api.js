import { State } from './state.js';

export const API = {
    allData: [],
    mappings: {},
    isLoaded: false,
    cf: null, dims: {}, groups: {},

    async init() {
        console.log("⏳ 启动流式引擎...");
        try {
            const jsonRes = await fetch('crime_mapping.json');
            this.mappings = await jsonRes.json();
            const loaderText = document.getElementById('loader-text');
            if(loaderText) loaderText.innerText = "Connecting to data stream...";

            return new Promise((resolve, reject) => {
                let parsedCount = 0;
                const totalEstimatedRecords = 1700000; 
                
                Papa.parse('chicago_crimes_data_20-26.csv', {
                    download: true, header: false, skipEmptyLines: true, chunkSize: 1024 * 1024 * 2,
                    chunk: (results) => {
                        for (let i = 0; i < results.data.length; i++) {
                            const p = results.data[i];
                            if (p[0] === 'lat') continue;
                            this.allData.push({
                                lat: parseFloat(p[0]), lng: parseFloat(p[1]),
                                y: parseInt(p[2]), m: parseInt(p[3]), d: parseInt(p[4]), h: parseInt(p[5]),
                                min: parseInt(p[6]), ca: parseInt(p[7]), t: parseInt(p[8]), desc: parseInt(p[9])
                            });
                        }
                        parsedCount += results.data.length;
                        const progressBar = document.getElementById('loader-progress');
                        if (progressBar) progressBar.style.width = `${Math.min((parsedCount / totalEstimatedRecords) * 100, 100)}%`;
                        if(loaderText) loaderText.innerText = `Parsing records... ${(parsedCount / 10000).toFixed(1)}W`;
                    },
                    complete: () => {
                        const progressBar = document.getElementById('loader-progress');
                        if (progressBar) progressBar.style.width = '100%';
                        if(loaderText) loaderText.innerText = "Building Crossfilter Multi-dimensional Index...";
                        
                        setTimeout(() => {
                            this.cf = crossfilter(this.allData);
                            this.dims.year = this.cf.dimension(d => d.y);
                            this.dims.month = this.cf.dimension(d => d.m + (d.d - 1) / 31.0); 
                            this.dims.time = this.cf.dimension(d => d.h + d.min / 60.0);
                            this.dims.type = this.cf.dimension(d => d.t);
                            this.dims.ca = this.cf.dimension(d => d.ca);

                            this.groups.year = this.dims.year.group();
                            this.groups.month = this.dims.month.group(d => Math.floor(d));
                            this.groups.time = this.dims.time.group(d => Math.floor(d));
                            this.groups.ca = this.dims.ca.group();
                            this.groups.type = this.dims.type.group();

                            this.isLoaded = true;
                            resolve(); 
                        }, 50);
                    },
                    error: (err) => reject(err)
                });
            });
        } catch (e) { console.error("❌ 初始化错误", e); }
    },

    getAllowedTypeIds(crimeTypesStrArray) {
        const allowed = new Set();
        if (!crimeTypesStrArray || crimeTypesStrArray.length === 0) return allowed;
        const hasOther = crimeTypesStrArray.includes('OTHER');
        
        // 👑 动态读取当前哪些是大类
        const explicitTypes = State.explicitTypes; 

        for (const [idStr, name] of Object.entries(this.mappings.types)) {
            const id = parseInt(idStr);
            if (crimeTypesStrArray.includes(name)) allowed.add(id);
            else if (hasOther && !explicitTypes.includes(name)) allowed.add(id);
        }
        return allowed;
    },

    updateCrossfilterState(filters) {
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
        
        if (allowedTypes.size === 0) this.dims.type.filter(-1); 
        else this.dims.type.filterFunction(t => allowedTypes.has(t));

        if (filters.year) this.dims.year.filterRange([filters.year[0], filters.year[1]]);
        else this.dims.year.filterAll();
        
        if (filters.month) this.dims.month.filterRange([filters.month[0], filters.month[1]]);
        else this.dims.month.filterAll();
        
        if (filters.time) this.dims.time.filterRange([filters.time[0], filters.time[1] + 0.001]);
        else this.dims.time.filterAll();
    },

    async fetchCrimes(filters, bounds, currentZoom = 20) {
        if (!this.isLoaded || !bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        if (currentZoom < 12.5) return { type: "FeatureCollection", features: [] };

        this.updateCrossfilterState(filters);
        const filteredRecords = this.dims.type.top(Infinity); 
        const features = [];
        const [south, north, west, east] = [bounds.getSouth(), bounds.getNorth(), bounds.getWest(), bounds.getEast()];

        // 读取动态颜色字典
        const typeColors = State.typeColors;
        const explicitTypes = State.explicitTypes;

        for (let i = 0; i < filteredRecords.length; i++) {
            const d = filteredRecords[i];
            if (d.lat < south || d.lat > north || d.lng < west || d.lng > east) continue;
            
            const rawType = this.mappings.types[d.t] || 'UNKNOWN';
            // 👑 动态赋色：如果在 explicit 里，用它的颜色；如果是 OTHER 里的小弟，统一用 OTHER 的颜色（灰色）
            const renderColor = explicitTypes.includes(rawType) ? (typeColors[rawType] || '#ffffff') : (typeColors['OTHER'] || '#7f7f7f');

            features.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: [d.lng, d.lat] },
                properties: { 
                    type: rawType,
                    desc: this.mappings.descriptions[d.desc] || '',
                    date: `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')} ${String(d.h).padStart(2,'0')}:${String(d.min).padStart(2,'0')}`,
                    color: renderColor // 将颜色直接打包进数据发给地图
                }
            });
        }
        return { type: "FeatureCollection", features };
    },

    async fetchMacroLayer(filters) {
        if (!this.isLoaded) return null;
        if (!window.cachedCommunityGeoJson) {
            const geoRes = await fetch('https://data.cityofchicago.org/resource/igwz-8jzy.geojson');
            window.cachedCommunityGeoJson = await geoRes.json();
        }
        const geoJson = JSON.parse(JSON.stringify(window.cachedCommunityGeoJson));
    
        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            geoJson.features.forEach(f => { f.properties.crime_count = 0; f.properties.severity_score = 0; });
            return { geoJson, thresholds: { p20: 1, p40: 2, p60: 3, p80: 4 }, isEmpty: true };
        }
    
        this.updateCrossfilterState(filters);
        const weights = filters.crimeWeights || {}; 
    
        const caTypeGroup = this.dims.ca.group().reduce(
            (p, d) => {
                const typeName = this.mappings.types[d.t] || 'UNKNOWN';
                p.total++; p.types[typeName] = (p.types[typeName] || 0) + 1; return p;
            },
            (p, d) => {
                const typeName = this.mappings.types[d.t] || 'UNKNOWN';
                p.total--; p.types[typeName] = (p.types[typeName] || 0) - 1; return p;
            },
            () => ({ total: 0, types: {} })
        );
    
        const groupedData = caTypeGroup.all();
        const caStats = {};
        let maxSeverity = 0; 
        
        // 👑 动态读取大类
        const explicitTypes = State.explicitTypes;
    
        groupedData.forEach(g => {
            let absSeverity = 0;
            for (let t in g.value.types) {
                const weightKey = explicitTypes.includes(t) ? t : 'OTHER';
                absSeverity += g.value.types[t] * (weights[weightKey] || 0);
            }
            caStats[g.key] = { total: g.value.total, types: g.value.types, severity: absSeverity };
            if (absSeverity > maxSeverity) maxSeverity = absSeverity;
        });
    
        const rankMap = {};        
        const sortedAreas = Object.entries(caStats).sort((a, b) => b[1].severity - a[1].severity);        
        sortedAreas.forEach(([areaId, _], index) => { rankMap[areaId] = index + 1; });        
        
        const scoreArray = []; 
        
        geoJson.features.forEach(f => {
            const areaId = parseInt(f.properties.area_num_1);
            const stat = caStats[areaId] || { total: 0, types: {}, severity: 0 };
    
            const score = maxSeverity > 0 ? Math.round((stat.severity / maxSeverity) * 100) : 0;
            
            f.properties.crime_count = stat.total; 
            f.properties.severity_score = score;   
            f.properties.rank = rankMap[areaId] || null;         
            f.properties.total_areas = 77;               
    
            const top5 = Object.entries(stat.types)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => ({ type, count }));
            f.properties.top_crimes_json = JSON.stringify(top5);
    
            if (score > 0) scoreArray.push(score);
        });
    
        caTypeGroup.dispose();
    
        scoreArray.sort((a, b) => a - b);
        let p20 = scoreArray[Math.floor(scoreArray.length * 0.2)] || 1;
        let p40 = scoreArray[Math.floor(scoreArray.length * 0.4)] || 2;
        let p60 = scoreArray[Math.floor(scoreArray.length * 0.6)] || 3;
        let p80 = scoreArray[Math.floor(scoreArray.length * 0.8)] || 4;
        
        if (p40 <= p20) p40 = p20 + 1;
        if (p60 <= p40) p60 = p40 + 1;
        if (p80 <= p60) p80 = p60 + 1;
    
        return { geoJson, thresholds: { p20, p40, p60, p80 }, isEmpty: scoreArray.length === 0 };
    },

    async fetchHistograms(filters) {
        if (!this.isLoaded) return { year: new Map(), month: new Map(), time: new Map(), typeCounts: {}, subTypeCounts: {} };
        
        this.updateCrossfilterState(filters);
        
        const cfGroupToMap = (group) => {
            const map = new Map();
            group.all().forEach(d => map.set(d.key, d.value));
            return map;
        };

        const typeCounts = {};
        const subTypeCounts = {}; 
        
        // 👑 动态读取大类
        const explicitTypes = State.explicitTypes;
        
        this.groups.type.all().forEach(({ key, value }) => {
            const name = this.mappings.types[key];
            if (name) {
                if (explicitTypes.includes(name)) {
                    typeCounts[name] = (typeCounts[name] || 0) + value;
                } else {
                    typeCounts['OTHER'] = (typeCounts['OTHER'] || 0) + value;
                    if (value > 0) subTypeCounts[name] = value; 
                }
            }
        });

        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { year: new Map(), month: new Map(), time: new Map(), typeCounts, subTypeCounts };
        }

        return { 
            year: cfGroupToMap(this.groups.year), 
            month: cfGroupToMap(this.groups.month), 
            time: cfGroupToMap(this.groups.time),
            typeCounts,
            subTypeCounts 
        };
    },

    async fetchSankey(areaId, filters) {
        if (!this.isLoaded) return null;
        this.updateCrossfilterState(filters);
        this.dims.ca.filterExact(areaId);
    
        const typeTimeGroup = this.dims.type.group().reduce(
            (p, d) => { const slot = d.h < 6 ? 'Late Night' : d.h < 12 ? 'Morning' : d.h < 18 ? 'Afternoon' : 'Night'; p[slot] = (p[slot] || 0) + 1; return p; },
            (p, d) => { const slot = d.h < 6 ? 'Late Night' : d.h < 12 ? 'Morning' : d.h < 18 ? 'Afternoon' : 'Night'; p[slot] = (p[slot] || 0) - 1; return p; },
            () => ({ 'Late Night': 0, 'Morning': 0, 'Afternoon': 0, 'Night': 0 })
        );
    
        const raw = typeTimeGroup.all();
        const allowedTypesSet = this.getAllowedTypeIds(filters.crimeTypes);
        const hasTypesFilter = allowedTypesSet.size > 0;
        const nodes = [], links = [], nodeIndex = {};
    
        const getNodeIndex = (name) => {
            if (nodeIndex[name] === undefined) { nodeIndex[name] = nodes.length; nodes.push({ name }); }
            return nodeIndex[name];
        };
    
        raw.forEach(g => {
            if (hasTypesFilter && !allowedTypesSet.has(g.key)) return; 
            const typeName = this.mappings.types[g.key] || 'UNKNOWN';
            ['Late Night', 'Morning', 'Afternoon', 'Night'].forEach(slot => {
                const value = g.value[slot] || 0;
                if (value > 0) links.push({ source: getNodeIndex(typeName), target: getNodeIndex(slot), value });
            });
        });
        this.dims.ca.filterAll(); typeTimeGroup.dispose();  
        return { nodes, links, areaId };
    }
};