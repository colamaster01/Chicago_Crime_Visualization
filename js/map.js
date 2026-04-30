const ZOOM_THRESHOLD = 12.5; // 定义宏观与微观的切换界限

export const MapRenderer = {
    map: null, 
    popup: null, 
    isLoaded: false, 

    init(onReadyCallback) {
        this.map = new maplibregl.Map({
            container: 'map', 
            style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', 
            center: [-87.7, 41.83], 
            zoom: 9.6 
        });
        this.popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            // 💡 关键：将锚点设为左侧，这样内容会向右展开
            anchor: 'bottom', 
            // 💡 偏移量：第一个数字是 [x, y]。设置 x 为 15，让它距离鼠标尖端有 15px 的空隙
            offset: [0,-15] 
        });

        this.map.on('load', () => {
            console.log("Map loaded");
            this.isLoaded = true;
            this.setupLayers();       
            this.setupInteractions(); 
            if(onReadyCallback) onReadyCallback();
        });

        window.myMap = this.map; 
        this.onCommunityClick = null; // ✅ 新增
    },

    setupLayers() {
        // ================= 1. 宏观图层 =================
        this.map.addSource('macro-areas', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });
        
        this.map.addLayer({
            id: 'area-fill',
            type: 'fill',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD,
            paint: {
                'fill-color': '#ccc', 
                'fill-opacity': 0.75
            }
        });

        this.map.addLayer({
            id: 'area-borders',
            type: 'line',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD,
            paint: { 'line-color': '#000000', 'line-width': 1.3, 'line-opacity': 0.5 }
        });

        this.map.addLayer({
            id: 'community-labels',
            type: 'symbol',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD,
            layout: {
                'text-field': ['get', 'community'], 
                'text-size': 11,
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
                'text-justify': 'center'
            },
            paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
        });

        // ================= 2. 微观聚类图层 =================
        this.map.addSource('micro-points', { 
            type: 'geojson', 
            data: { type: "FeatureCollection", features: [] },
            cluster: true, 
            clusterMaxZoom: 15, 
            // 【修改点 1】：将吸附半径从 50 爆改为 180，大幅减少聚类圈的数量！
            clusterRadius: 180 
        });

        this.map.addLayer({
            id: 'clusters', 
            type: 'circle', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD,
            filter: ['has', 'point_count'],
            paint: {
                // 【修改点 2】：重设颜色梯队 (黄 -> 橙 -> 亮红 -> 深红)
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#ffe066',     // 默认：浅黄色 (< 1000)
                    1000, '#ffb700', // >= 1000: 亮黄色
                    5000, '#ff7b00', // >= 5000: 橘红色
                    20000, '#f44336',// >= 20000: 鲜红色
                    50000, '#b71c1c' // >= 50000: 深红色大点
                ],
                // 【修改点 3】：重设大小梯队 (圆圈半径差距拉大，体现视觉冲击)
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    25,           // 默认半径
                    500, 30,
                    1000, 40,
                    5000, 45,
                    10000, 50     // 超级巨无霸
                ],
                'circle-stroke-width': 3, 
                'circle-stroke-color': 'rgba(255, 255, 255, 0.8)' // 半透明白边，更显高级
            }
        });

        this.map.addLayer({
            id: 'cluster-count', 
            type: 'symbol', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD,
            filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 15 },
            paint: { 'text-color': '#000000' } // 黑色字体在彩色底上更清晰
        });

        this.map.addLayer({
            id: 'unclustered-point', 
            type: 'circle', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD,
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['match', ['get', 'type'], 'THEFT', '#1f77b4', 'BATTERY', '#ff7f0e', 'CRIMINAL DAMAGE', '#ffbb78', 'NARCOTICS', '#2ca02c', 'ASSAULT', '#d62728', 'BURGLARY', '#9467bd', 'ROBBERY', '#8c564b', 'MOTOR VEHICLE THEFT', '#e377c2', 'HOMICIDE', '#000000', '#7f7f7f'],
                'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff'
            }
        });
    },

    setupInteractions() {
        // this.map.on('mousemove', 'area-fill', (e) => {
        //     this.map.getCanvas().style.cursor = 'pointer';
        //     const props = e.features[0].properties;
        //     const html = `<strong>${props.community}</strong><br><span style="color:#d32f2f">Crimes: ${props.crime_count || 0}</span>`;
        //     this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
        // });
        this.map.on('mousemove', 'area-fill', (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            const props = e.features[0].properties;
            const total = props.crime_count || 0;
            const rank = props.rank || '?';
            const totalAreas = props.total_areas || 77; // 芝加哥固定77个社区
            // --- 💡 关键修改：双保险获取 Top 5 ---
            let topCrimes = [];
            if (props.top_crimes_json) {
                // 方案 A: 使用预聚合的 JSON（性能最高）
                topCrimes = JSON.parse(props.top_crimes_json);
            } else {
                // 方案 B: 现场暴力抓取（防止预聚合失效的保底方案）
                const blacklist = ['community', 'crime_count', 'top_crimes_json', 'area_num_1', 'shape_area', 'shape_len'];
                topCrimes = Object.keys(props)
                    .filter(key => !blacklist.includes(key.toLowerCase()) && typeof props[key] === 'number')
                    .map(key => ({ type: key, count: props[key] }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5);
            }
        
            // 生成行 HTML
            const rowsHtml = topCrimes.map(c => {
                const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                return `
                    <div style="margin-top: 5px;">
                        <div style="display: flex; justify-content: space-between; font-size: 10px; line-height: 1.2;">
                            <span style="color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">${c.type}</span>
                            <span style="color: #94a3b8;">${c.count.toLocaleString()} (${pct}%)</span>
                        </div>
                        <div style="width: 100%; background: #334155; height: 3px; border-radius: 2px; margin-top: 2px;">
                            <div style="width: ${pct}%; background: #4ade80; height: 100%; border-radius: 2px;"></div>
                        </div>
                    </div>`;
            }).join('');
        
            // 组装最终 HTML
            const html = `
                <div style="background: rgba(15, 23, 42, 0.95); color: #f8fafc; padding: 10px; border-radius: 8px; width: 150px; border: 1px solid #334155; pointer-events: none; font-family: sans-serif;">
                    <div style="font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 5px; margin-bottom: 8px; font-size: 13px;">
                        ${props.community || 'Unknown'}
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #94a3b8; font-size: 11px;">
                        <span>Case Count</span>
                        <span style="color: #fff; font-weight: bold;">${total.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #94a3b8; font-size: 11px;">
                        <span>Ranking</span>
                        <span style="color: ${rank <= 10 ? '#f87171' : rank <= 30 ? '#fbbf24' : '#86efac'}; font-weight: bold;">
                            #${rank} / ${totalAreas}
                        </span>
                    </div>
                    <div style="border-top: 1px solid #1e293b; padding-top: 5px;">
                        ${rowsHtml || '<div style="color: #64748b; font-size: 10px;">Waiting for data...</div>'}
                    </div>
                </div>
            `;
        
            this.popup.setLngLat(e.lngLat).setHTML(html).addTo(this.map);
        });

        this.map.on('mouseleave', 'area-fill', () => {
            this.map.getCanvas().style.cursor = '';
            this.popup.remove();
        });

        // 点击聚类圆圈，自动缩放并散开
        this.map.on('click', 'clusters', async (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const zoom = await this.map.getSource('micro-points').getClusterExpansionZoom(features[0].properties.cluster_id);
            this.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
        });

        this.map.on('mouseenter', 'clusters', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'clusters', () => { this.map.getCanvas().style.cursor = ''; });

        this.map.on('mousemove', 'unclustered-point', (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            const props = e.features[0].properties;
            
            // 👈 恢复最新的案件介绍界面，并统一采用暗黑赛博风格 UI
            const html = `
                <div style="background: rgba(15, 23, 42, 0.95); color: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; font-family: sans-serif; max-width: 220px; pointer-events: none; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    <strong style="color:#ef4444; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">
                        ${props.type}
                    </strong>
                    <div style="color:#e2e8f0; font-weight: 500; font-size: 12px; margin-bottom: 6px; line-height: 1.4;">
                        ${props.desc || 'No specific description'}
                    </div>
                    <div style="border-top: 2px solid #1e293b; padding-top: 6px; color:#94a3b8; font-size: 11px;">
                         ${props.date}
                    </div>
                </div>
            `;
            
            this.popup.setLngLat(e.features[0].geometry.coordinates).setHTML(html).addTo(this.map);
        });
        
        this.map.on('mouseleave', 'unclustered-point', () => {
            this.map.getCanvas().style.cursor = '';
            this.popup.remove();
        });

        //新加的sankey：
        // 点击社区面，打开桑基图面板
        this.map.on('click', 'area-fill', (e) => {
            const props = e.features[0].properties;
            const areaId = parseInt(props.area_num_1);
            const communityName = props.community || 'Unknown';

            // 通过回调把数据传出去，避免 map.js 直接依赖 SankeyPanel
            if (this.onCommunityClick) {
                this.onCommunityClick(areaId, communityName);
            }
        });
    },
    
    updateMacroData(macroData) {
        if (!this.isLoaded || !macroData || !this.map.getSource('macro-areas')) return;
        // ❌ 删掉整个 forEach 注入 top_crimes_json 的块，不再需要

        this.map.getSource('macro-areas').setData(macroData.geoJson);
    
        // ... 下面设置 thresholds 和 fill-color 的逻辑保持不变 ...
        if (!macroData.isEmpty) {
            const t = macroData.thresholds;
            this.map.setPaintProperty('area-fill', 'fill-color', [
                'step', ['get', 'crime_count'],
                '#1a9850', t.p20, '#a6d96a', t.p40, '#fee08b', t.p60, '#fc8d59', t.p80, '#d73027'
            ]);
        }
    },

    updateMicroData(geoJsonData) {
        if (this.isLoaded && this.map.getSource('micro-points')) {
            this.map.getSource('micro-points').setData(geoJsonData);
        }
    }
};