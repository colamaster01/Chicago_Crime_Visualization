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

        this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

        this.map.on('load', () => {
            console.log("Map loaded");
            this.isLoaded = true;
            this.setupLayers();       
            this.setupInteractions(); 
            if(onReadyCallback) onReadyCallback();
        });

        window.myMap = this.map; 
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
        this.map.on('mousemove', 'area-fill', (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            const props = e.features[0].properties;
            const html = `<strong>${props.community}</strong><br><span style="color:#d32f2f">Crimes: ${props.crime_count || 0}</span>`;
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
            const html = `<div style="font-size: 13px;"><strong style="color:#d32f2f;">${props.type}</strong><br><span style="color:#666;">${new Date(props.date).toLocaleString()}</span></div>`;
            this.popup.setLngLat(e.features[0].geometry.coordinates).setHTML(html).addTo(this.map);
        });
        
        this.map.on('mouseleave', 'unclustered-point', () => {
            this.map.getCanvas().style.cursor = '';
            this.popup.remove();
        });
    },

    updateMacroData(macroData) {
        if (!this.isLoaded || !macroData || !this.map.getSource('macro-areas')) return;
        
        this.map.getSource('macro-areas').setData(macroData.geoJson);

        if (macroData.isEmpty) {
            this.map.setPaintProperty('area-fill', 'fill-color', '#6a6868');
        } else {
            const t = macroData.thresholds;
            this.map.setPaintProperty('area-fill', 'fill-color', [
                'step', ['get', 'crime_count'],
                '#1a9850', t.p20, 
                '#a6d96a', t.p40, 
                '#fee08b', t.p60, 
                '#fc8d59', t.p80, 
                '#d73027'
            ]);
        }
    },

    updateMicroData(geoJsonData) {
        if (this.isLoaded && this.map.getSource('micro-points')) {
            this.map.getSource('micro-points').setData(geoJsonData);
        }
    }
};