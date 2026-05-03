export function initClusterTooltip(map) {
    function getClusterRadiusKm(zoom) {
        var lat = 41.83;
        var earthCircumference = 40075016.686;
        var tileSize = 512;
        var metersPerPixel =
            (earthCircumference * Math.cos(lat * Math.PI / 180)) /
            (tileSize * Math.pow(2, zoom));
        return (metersPerPixel * 180 / 1000).toFixed(2);
    }

    function buildClusterPopupHtml(pointCount, radiusKm, typeCounts, typeColors) {
        var header = '' +
            '<div style="font-weight:bold; font-size:12px; border-bottom:1px solid #334155;' +
            'padding-bottom:4px; margin-bottom:6px; color:#f8fafc; display:flex; justify-content:space-between;">' +
            '<span>Cluster Detail</span>' +
            '<span style="font-size:10px; font-weight:normal; color:#94a3b8;">~' + radiusKm + ' km radius</span></div>';

        if (!typeCounts) {
            return '' +
                '<div style="background:rgba(15,23,42,0.95); color:#f8fafc; padding:10px;' +
                'border-radius:8px; width:240px; min-height:110px; border:1px solid #334155; font-family:sans-serif;">' +
                header +
                '<div style="color:#64748b; font-size:11px; text-align:center; padding-top:25px;">' +
                'Loading breakdown...</div></div>';
        }

        var sorted = Object.entries(typeCounts).sort(function (a, b) { return b[1] - a[1]; });
        var top5 = sorted.slice(0, 5); 
        var others = sorted.slice(5).reduce(function (s, v) { return s + v[1]; }, 0);
        if (others > 0) {
            top5.push(['Others', others]);
            if (!typeColors['Others']) typeColors['Others'] = '#64748b';
        }
        var total = top5.reduce(function (s, v) { return s + v[1]; }, 0) || 1;

        var cx = 40, cy = 40, rOut = 36, rIn = 18;
        var tau = 2 * Math.PI;
        var startAngle = -Math.PI / 2;
        var arcPaths = top5.map(function (item) {
            var type = item[0], count = item[1];
            var sweep = (count / total) * tau;
            var endAngle = startAngle + sweep;
            
            var x1 = cx + rOut * Math.cos(startAngle);
            var y1 = cy + rOut * Math.sin(startAngle);
            var x2 = cx + rOut * Math.cos(endAngle);
            var y2 = cy + rOut * Math.sin(endAngle);
            var ix1 = cx + rIn * Math.cos(endAngle);
            var iy1 = cy + rIn * Math.sin(endAngle);
            var ix2 = cx + rIn * Math.cos(startAngle);
            var iy2 = cy + rIn * Math.sin(startAngle);
            var largeArc = sweep > Math.PI ? 1 : 0;
            var d = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
                ' A ' + rOut + ' ' + rOut + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
                ' L ' + ix1.toFixed(1) + ' ' + iy1.toFixed(1) +
                ' A ' + rIn + ' ' + rIn + ' 0 ' + largeArc + ' 0 ' + ix2.toFixed(1) + ' ' + iy2.toFixed(1) + ' Z';
            
            startAngle = endAngle;
            return { d: d, color: typeColors[type] || '#7f7f7f' };
        });

        var pathsHtml = arcPaths.map(function (a) {
            return '<path d="' + a.d + '" fill="' + a.color + '" stroke="#0f172a" stroke-width="1" opacity="0.95"/>';
        }).join('');

        var svgHtml = '' +
            '<svg width="80" height="80" viewBox="0 0 80 80"' +
            ' style="display:block; flex-shrink:0; overflow:visible;">' +
            pathsHtml +
            '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" style="font-size:8px; fill:#94a3b8; font-family:sans-serif;">Total</text>' +
            '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" style="font-size:10px; fill:#fbbf24; font-weight:bold; font-family:sans-serif;">' + Number(pointCount).toLocaleString() + '</text>' +
            '</svg>';

        var legendHtml = top5.map(function (item) {
            var type = item[0], count = item[1];
            var pct = ((count / total) * 100).toFixed(1);
            var color = typeColors[type] || '#7f7f7f';
            return '' +
                '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">' +
                '<div style="display:flex; align-items:center; gap:4px; min-width:0;">' +
                '<div style="width:6px; height:6px; border-radius:50%; background:' + color + '; flex-shrink:0;"></div>' +
                '<span style="font-size:9px; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90px;" title="'+type+'">' + type + '</span></div>' +
                '<span style="font-size:9px; color:#94a3b8; flex-shrink:0; margin-left:4px;">' + pct + '%</span></div>';
        }).join('');

        return '' +
            '<div style="background:rgba(15,23,42,0.95); color:#f8fafc; padding:10px;' +
            'border-radius:8px; width:250px; min-height:110px; border:1px solid #334155;' +
            'font-family:sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.4);">' +
            header + 
            '<div style="display:flex; align-items:center; gap:12px;">' +
                svgHtml +
                '<div style="flex:1; display:flex; flex-direction:column; justify-content:center;">' + legendHtml + '</div>' +
            '</div>' +
            '</div>';
    }

    if (!document.getElementById('cluster-popup-style')) {
        var style = document.createElement('style');
        style.id = 'cluster-popup-style';
        style.innerHTML = '' +
            '.cluster-popup { pointer-events: none !important; }' +
            '.cluster-popup * { pointer-events: none !important; }';
        document.head.appendChild(style);
    }

    var clusterPopup = null; 
    var currentHoveredClusterId = null;
    var pendingClusterId = null;

    map.on('mousemove', 'clusters', function (e) {
        if (map.getPitch() >= 35) {
            if (clusterPopup) clusterPopup.remove();
            currentHoveredClusterId = null;
            pendingClusterId = null;
            return;
        }

        var features = e.features;
        if (!features || !features.length) return;

        var props = features[0].properties;
        var clusterId = props.cluster_id;
        var pointCount = props.point_count;
        var zoom = map.getZoom();
        var radiusKm = getClusterRadiusKm(zoom);
        var lngLat = e.lngLat;

        if (currentHoveredClusterId === clusterId) {
            if (clusterPopup) {
                clusterPopup.setLngLat(lngLat);
                if (!clusterPopup.isOpen()) clusterPopup.addTo(map);
            }
            return;
        }

        pendingClusterId = clusterId;
        currentHoveredClusterId = clusterId;

        if (clusterPopup) clusterPopup.remove();

        var mapWidth = map.getCanvas().clientWidth;
        var mapHeight = map.getCanvas().clientHeight;
        
        var nx = (e.point.x - mapWidth / 2) / mapWidth;
        var ny = (e.point.y - mapHeight / 2) / mapHeight;

        var anchorType, offsetVal;
        
        if (Math.abs(nx) > Math.abs(ny)) {
            if (nx > 0) {
                anchorType = 'right'; 
                offsetVal = [-15, 0];
            } else {
                anchorType = 'left';  
                offsetVal = [15, 0];
            }
        } else {
            if (ny > 0) {
                anchorType = 'bottom'; 
                offsetVal = [0, -15];
            } else {
                anchorType = 'top';    
                offsetVal = [0, 15];
            }
        }

        clusterPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: anchorType, 
            offset: offsetVal,
            className: 'cluster-popup'
        });

        clusterPopup.setHTML(buildClusterPopupHtml(pointCount, radiusKm, null, {}));
        clusterPopup.setLngLat(lngLat);
        if (!clusterPopup.isOpen()) clusterPopup.addTo(map);

        var source = map.getSource('micro-points');
        if (source && typeof source.getClusterLeaves === 'function') {
            try {
                source.getClusterLeaves(clusterId, 500, 0, function (err, leaves) {
                    if (pendingClusterId !== clusterId) return;
                    if (err || !leaves || !leaves.length) return;

                    var typeCounts = {};
                    var typeColors = {};
                    leaves.forEach(function (leaf) {
                        var t = (leaf.properties && leaf.properties.type) || 'UNKNOWN';
                        var c = (leaf.properties && leaf.properties.color) || '#7f7f7f';
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                        if (!typeColors[t]) typeColors[t] = c;
                    });

                    var html = buildClusterPopupHtml(pointCount, radiusKm, typeCounts, typeColors);
                    if (clusterPopup) {
                        clusterPopup.setHTML(html);
                        if (!clusterPopup.isOpen()) clusterPopup.addTo(map);
                    }
                });
            } catch (ex) {}
        }
    });

    map.on('mouseleave', 'clusters', function () {
        currentHoveredClusterId = null;
        pendingClusterId = null;
        if (clusterPopup) clusterPopup.remove();
    });

    map.on('mouseleave', 'unclustered-point', function () {
        if (clusterPopup) clusterPopup.remove();
    });

    map.on('zoom', function () {
        currentHoveredClusterId = null;
        pendingClusterId = null;
        if (clusterPopup) clusterPopup.remove();
    });
}