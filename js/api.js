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
        const explicitTypes = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE'];
        for (const [idStr, name] of Object.entries(this.mappings.types)) {
            const id = parseInt(idStr);
            if (crimeTypesStrArray.includes(name)) allowed.add(id);
            else if (hasOther && !explicitTypes.includes(name)) allowed.add(id);
        }
        return allowed;
    },

    updateCrossfilterState(filters) {
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
        
        // 👑 恢复此处的判定：如果一个类别都没选，使用 filter(-1) 彻底屏蔽地图和底部时间轴图表的数据
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
        // 无类型选中时，提前阻断，地图不画点
        if (!this.isLoaded || !bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        
        if (currentZoom < 12.5) {
            return { type: "FeatureCollection", features: [] };
        }

        this.updateCrossfilterState(filters);
        const filteredRecords = this.dims.type.top(Infinity); 
        const features = [];
        const [south, north, west, east] = [bounds.getSouth(), bounds.getNorth(), bounds.getWest(), bounds.getEast()];

        for (let i = 0; i < filteredRecords.length; i++) {
            const d = filteredRecords[i];
            if (d.lat < south || d.lat > north || d.lng < west || d.lng > east) continue;
            features.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: [d.lng, d.lat] },
                properties: { 
                    type: this.mappings.types[d.t] || 'UNKNOWN',
                    desc: this.mappings.descriptions[d.desc] || '',
                    date: `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')} ${String(d.h).padStart(2,'0')}:${String(d.min).padStart(2,'0')}`
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
    
        // 👑 无类型选中时，提前阻断，渲染灰色底图
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
    
        groupedData.forEach(g => {
            let absSeverity = 0;
            for (let t in g.value.types) {
                absSeverity += g.value.types[t] * (weights[t] || 0);
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
        if (!this.isLoaded) return { year: new Map(), month: new Map(), time: new Map(), typeCounts: {} };
        
        // 这一步确保时间滑块的值生效到交叉过滤器中
        this.updateCrossfilterState(filters);
        
        const cfGroupToMap = (group) => {
            const map = new Map();
            group.all().forEach(d => map.set(d.key, d.value));
            return map;
        };

        // 👑 统计案件类型 (利用 Crossfilter 机制，该统计只受时间影响，不受自身是否选中影响)
        const typeCounts = {};
        const explicitTypes = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE'];
        
        this.groups.type.all().forEach(({ key, value }) => {
            const name = this.mappings.types[key];
            if (name) {
                const displayName = explicitTypes.includes(name) ? name : 'OTHER';
                typeCounts[displayName] = (typeCounts[displayName] || 0) + value;
            }
        });

        // 👑 如果没有选中任何案件，地图和时间轴图表强制返回空 Map 清空视觉
        // 但是保留 typeCounts，让右侧的 D3 面板正常呈现全局数据基准！
        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { 
                year: new Map(), 
                month: new Map(), 
                time: new Map(), 
                typeCounts 
            };
        }

        return { 
            year: cfGroupToMap(this.groups.year), 
            month: cfGroupToMap(this.groups.month), 
            time: cfGroupToMap(this.groups.time),
            typeCounts 
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
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
        const nodes = [], links = [], nodeIndex = {};
    
        const getNodeIndex = (name) => {
            if (nodeIndex[name] === undefined) { nodeIndex[name] = nodes.length; nodes.push({ name }); }
            return nodeIndex[name];
        };
    
        raw.forEach(g => {
            if (!allowedTypes.has(g.key)) return; 
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