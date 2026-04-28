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
        // ================= 1. 宏观图层 (只在缩放 < 12.5 时显示) =================
        this.map.addSource('macro-areas', { type: 'geojson', data: { type: "FeatureCollection", features: [] } });
        
        this.map.addLayer({
            id: 'area-fill',
            type: 'fill',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD, // 【关键】放大超过 12.5 就隐藏
            paint: {
                'fill-color': '#ccc', 
                'fill-opacity': 0.75
            }
        });

        this.map.addLayer({
            id: 'area-borders',
            type: 'line',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD, // 【关键】放大超过 12.5 就隐藏
            paint: { 'line-color': '#000000', 'line-width': 1.3, 'line-opacity': 0.5 }
        });

        this.map.addLayer({
            id: 'community-labels',
            type: 'symbol',
            source: 'macro-areas',
            maxzoom: ZOOM_THRESHOLD, // 【关键】放大超过 12.5 就隐藏
            layout: {
                'text-field': ['get', 'community'], 
                'text-size': 11,
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
                'text-justify': 'center'
            },
            paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }
        });

        // ================= 2. 微观图层 (只在缩放 >= 12.5 时显示) =================
        this.map.addSource('micro-points', { 
            type: 'geojson', 
            data: { type: "FeatureCollection", features: [] },
            cluster: true, clusterMaxZoom: 15, clusterRadius: 50
        });

        this.map.addLayer({
            id: 'clusters', 
            type: 'circle', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD, // 【关键】缩小低于 12.5 就隐藏
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#f1f075', 100, '#ff9800', 500, '#f44336'],
                'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 500, 40],
                'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
            }
        });

        this.map.addLayer({
            id: 'cluster-count', 
            type: 'symbol', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD, // 【关键】缩小低于 12.5 就隐藏
            filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 14 },
            paint: { 'text-color': '#333333' }
        });

        this.map.addLayer({
            id: 'unclustered-point', 
            type: 'circle', 
            source: 'micro-points', 
            minzoom: ZOOM_THRESHOLD, // 【关键】缩小低于 12.5 就隐藏
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': ['match', ['get', 'type'], 'THEFT', '#1f77b4', 'BATTERY', '#ff7f0e', 'CRIMINAL DAMAGE', '#ffbb78', 'NARCOTICS', '#2ca02c', 'ASSAULT', '#d62728', 'BURGLARY', '#9467bd', 'ROBBERY', '#8c564b', 'MOTOR VEHICLE THEFT', '#e377c2', 'HOMICIDE', '#000000', '#7f7f7f'],
                'circle-radius': 6, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff'
            }
        });
    },

    setupInteractions() {
        // 宏观图层的悬停提示
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

        // 聚类点击放大
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

        // 【修改点】：检查是否为空数据状态
        if (macroData.isEmpty) {
            // 如果什么都没勾选，直接将整个底图涂成浅灰色 (#e0e0e0)
            this.map.setPaintProperty('area-fill', 'fill-color', '#6a6868');
        } else {
            // 如果有勾选，恢复动态步进计算的热力色块
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