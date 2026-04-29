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
                    date: `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')} ${String(d.h).padStart(2,'0')}:${String(d.min).padStart(2,'0')}:00` 
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
        const groupedData = this.groups.ca.all(); 
        
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
    }
};