export const API = {
    allData: [],
    mappings: {},
    isLoaded: false,
    
    cf: null,
    dims: {},
    groups: {},

    async init() {
        console.log("⏳ 启动流式引擎 (Streaming Parser)...");
        try {
            // 1. 获取字典映射
            const jsonRes = await fetch('crime_mapping.json');
            this.mappings = await jsonRes.json();

            // 抓取页面上的 Loading 文本元素
            const loaderText = document.getElementById('loader-text');
            if(loaderText) loaderText.innerText = "Connecting to data stream...";

            // 2. 使用 Promise 包装 PapaParse 的异步流式读取
            return new Promise((resolve, reject) => {
                let parsedCount = 0;
                const totalEstimatedRecords = 1700000; // 👈 【新增】：估算的总数据量 (170万条)
                
                Papa.parse('chicago_crimes_data_20-26.csv', {
                    download: true,
                    header: false,
                    skipEmptyLines: true,
                    chunkSize: 1024 * 1024 * 2,
                    
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
                        
                        // 👈 【新增】：计算百分比并更新进度条宽度
                        const progressBar = document.getElementById('loader-progress');
                        if (progressBar) {
                            // 防止数据超标导致百分比超过 100%
                            let percent = Math.min((parsedCount / totalEstimatedRecords) * 100, 100);
                            progressBar.style.width = `${percent}%`;
                        }
                        
                        if(loaderText) {
                            loaderText.innerText = `Parsing records... ${(parsedCount / 10000).toFixed(1)}W`;
                        }
                    },
                    
                    complete: () => {
                        // 👈 【新增】：读完后强制把进度条拉满到 100%
                        const progressBar = document.getElementById('loader-progress');
                        if (progressBar) progressBar.style.width = '100%';

                        if(loaderText) loaderText.innerText = "Building Crossfilter Multi-dimensional Index...";
                        
                        // 使用 setTimeout 稍微释放一下主线程，让浏览器有机会把上面那行文字渲染出来
                        setTimeout(() => {
                            this.cf = crossfilter(this.allData);

                            this.dims.year = this.cf.dimension(d => d.y);
                            this.dims.month = this.cf.dimension(d => d.m);
                            this.dims.time = this.cf.dimension(d => d.h + d.min / 60.0);
                            this.dims.type = this.cf.dimension(d => d.t);
                            this.dims.ca = this.cf.dimension(d => d.ca);

                            this.groups.year = this.dims.year.group();
                            this.groups.month = this.dims.month.group();
                            this.groups.time = this.dims.time.group(d => Math.floor(d));
                            this.groups.ca = this.dims.ca.group();

                            this.isLoaded = true;
                            console.log(`✅ 流式解析与索引建立完毕！完美吞下 ${this.cf.size()} 条案件。`);
                            resolve(); // 告诉外部，初始化大功告成！
                        }, 50);
                    },
                    
                    // 应对网络中断
                    error: (err) => {
                        console.error("流式读取失败", err);
                        if(loaderText) loaderText.innerText = "Stream interrupted. Please refresh.";
                        reject(err);
                    }
                });
            });

        } catch (e) {
            console.error("❌ 数据初始化遭遇致命错误", e);
        }
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
        if (allowedTypes.size === 0) {
            this.dims.type.filter(-1); 
        } else {
            this.dims.type.filterFunction(t => allowedTypes.has(t));
        }

        if (filters.year) this.dims.year.filterRange([filters.year[0], filters.year[1] + 1]);
        else this.dims.year.filterAll();

        if (filters.month) this.dims.month.filterRange([filters.month[0], filters.month[1] + 1]);
        else this.dims.month.filterAll();

        // 👈 【修改点】：基于浮点数的极速过滤，增加一点点余量包含 24:00
        if (filters.time) this.dims.time.filterRange([filters.time[0], filters.time[1] + 0.001]);
        else this.dims.time.filterAll();
    },

    async fetchCrimes(filters, bounds) {
        if (!this.isLoaded || !bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        
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
    
        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            geoJson.features.forEach(f => f.properties.crime_count = 0);
            return { geoJson, thresholds: { p20: 1, p40: 2, p60: 3, p80: 4 }, isEmpty: true };
        }
    
        this.updateCrossfilterState(filters);
    
        // ✅ 新增：按社区做带犯罪类型细分的 reduce 分组
        const caTypeGroup = this.dims.ca.group().reduce(
            // add
            (p, d) => {
                const typeName = this.mappings.types[d.t] || 'UNKNOWN';
                p.total++;
                p.types[typeName] = (p.types[typeName] || 0) + 1;
                return p;
            },
            // remove
            (p, d) => {
                const typeName = this.mappings.types[d.t] || 'UNKNOWN';
                p.total--;
                p.types[typeName] = (p.types[typeName] || 0) - 1;
                return p;
            },
            // init
            () => ({ total: 0, types: {} })
        );
    
        const groupedData = caTypeGroup.all();
    
        const caStats = {};
        groupedData.forEach(g => {
            caStats[g.key] = g.value; // { total, types }
        });
    
        const countsArray = [];
        //加了ranking
        const rankMap = {};        // ✅ 新增
        const sortedAreas = Object.entries(caStats)        // ✅ 新增
            .sort((a, b) => b[1].total - a[1].total);        // ✅ 新增
        sortedAreas.forEach(([areaId, _], index) => {        // ✅ 新增
            rankMap[areaId] = index + 1;        // ✅ 新增
        });        // ✅ 新增
        const totalAreas = sortedAreas.length;
        geoJson.features.forEach(f => {
            const areaId = parseInt(f.properties.area_num_1);
            const stat = caStats[areaId] || { total: 0, types: {} };
    
            f.properties.crime_count = stat.total;
            f.properties.rank = rankMap[areaId] || null;         // ✅ 新增
            f.properties.total_areas = totalAreas;               // ✅ 新增
    
            // ✅ 把 top5 直接算好挂上去
            const top5 = Object.entries(stat.types)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => ({ type, count }));
            f.properties.top_crimes_json = JSON.stringify(top5);
    
            if (stat.total > 0) countsArray.push(stat.total);
        });
    
        // ✅ 用完立刻释放，避免内存泄漏
        caTypeGroup.dispose();
    
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

    async fetchHistograms(filters) {
        if (!this.isLoaded || !filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { year: new Map(), month: new Map(), time: new Map() };
        }

        this.updateCrossfilterState(filters);

        const cfGroupToMap = (group) => {
            const map = new Map();
            group.all().forEach(d => map.set(d.key, d.value));
            return map;
        };

        return { 
            year: cfGroupToMap(this.groups.year), 
            month: cfGroupToMap(this.groups.month), 
            time: cfGroupToMap(this.groups.time) // 👈 【修改点】
        };
    },
    /////新增桑基图
    async fetchSankey(areaId, filters) {
        if (!this.isLoaded) return null;
    
        this.updateCrossfilterState(filters);
        
        // 临时加一个社区维度的过滤
        this.dims.ca.filterExact(areaId);
    
        // 这里的 reduce 不受时间过滤影响，因为时间过滤在 dims.time 上，
        // 完美保留了 Crossfilter 的联动能力（0-7点时，只剩下6个小时的数据进入 reduce）
        const typeTimeGroup = this.dims.type.group().reduce(
            (p, d) => {
                const slot = d.h < 6 ? 'Late Night' : d.h < 12 ? 'Morning' : d.h < 18 ? 'Afternoon' : 'Night';
                p[slot] = (p[slot] || 0) + 1;
                return p;
            },
            (p, d) => {
                const slot = d.h < 6 ? 'Late Night' : d.h < 12 ? 'Morning' : d.h < 18 ? 'Afternoon' : 'Night';
                p[slot] = (p[slot] || 0) - 1;
                return p;
            },
            () => ({ 'Late Night': 0, 'Morning': 0, 'Afternoon': 0, 'Night': 0 })
        );
    
        const raw = typeTimeGroup.all();
        
        // 👈 【核心修复 1】：获取当前右侧复选框勾选了哪些案件类型
        const allowedTypes = this.getAllowedTypeIds(filters.crimeTypes);
    
        const nodes = [];
        const links = [];
        const nodeIndex = {};
    
        // 👈 【核心修复 2】：动态获取/创建节点，没数据的节点根本不会被创建！
        const getNodeIndex = (name) => {
            if (nodeIndex[name] === undefined) {
                nodeIndex[name] = nodes.length;
                nodes.push({ name });
            }
            return nodeIndex[name];
        };
    
        raw.forEach(g => {
            // 👈 【核心修复 3】：手动拦截被用户在右侧面板取消勾选的犯罪类型
            if (!allowedTypes.has(g.key)) return; 
            
            const typeName = this.mappings.types[g.key] || 'UNKNOWN';
            const TIME_SLOTS = ['Late Night', 'Morning', 'Afternoon', 'Night'];
    
            TIME_SLOTS.forEach(slot => {
                const value = g.value[slot] || 0;
                // 只有当流量 > 0 时，才生成 link 和 node
                if (value > 0) {
                    links.push({
                        source: getNodeIndex(typeName),
                        target: getNodeIndex(slot),
                        value
                    });
                }
            });
        });
    
        // 清理：还原 ca 过滤，销毁临时分组
        this.dims.ca.filterAll(); 
        typeTimeGroup.dispose();  
    
        return { nodes, links, areaId };
    },
};