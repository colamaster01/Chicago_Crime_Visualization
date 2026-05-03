
(function () {
    'use strict';
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
            '<div style="font-weight:bold; font-size:13px; border-bottom:1px solid #334155;' +
            'padding-bottom:6px; margin-bottom:8px; color:#f8fafc;">Cluster Detail</div>' +
            '<div style="display:flex; justify-content:space-between; font-size:11px;' +
            'color:#94a3b8; margin-bottom:4px;">' +
            '<span>Total Cases</span>' +
            '<span style="color:#fbbf24; font-weight:bold;">' + Number(pointCount).toLocaleString() + '</span></div>' +
            '<div style="display:flex; justify-content:space-between; font-size:11px;' +
            'color:#94a3b8; margin-bottom:10px;">' +
            '<span>Cluster Radius</span>' +
            '<span style="color:#60a5fa; font-weight:bold;">~' + radiusKm + ' km</span></div>';

        if (!typeCounts) {
            return '' +
                '<div style="background:rgba(15,23,42,0.95); color:#f8fafc; padding:12px;' +
                'border-radius:8px; width:180px; border:1px solid #334155; font-family:sans-serif;">' +
                header +
                '<div style="color:#64748b; font-size:11px; text-align:center; padding:20px 0;">' +
                'Loading crime breakdown...</div></div>';
        }

        var sorted = Object.entries(typeCounts).sort(function (a, b) { return b[1] - a[1]; });
        var top6 = sorted.slice(0, 6);
        var others = sorted.slice(6).reduce(function (s, v) { return s + v[1]; }, 0);
        if (others > 0) {
            top6.push(['Others', others]);
            if (!typeColors['Others']) typeColors['Others'] = '#64748b';
        }
        var total = top6.reduce(function (s, v) { return s + v[1]; }, 0) || 1;

        var cx = 60, cy = 60, rOut = 52, rIn = 26;
        var tau = 2 * Math.PI;
        var startAngle = -Math.PI / 2;
        var arcPaths = top6.map(function (item) {
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
            return { type: type, count: count, d: d, color: typeColors[type] || '#7f7f7f' };
        });

        var pathsHtml = arcPaths.map(function (a) {
            return '<path d="' + a.d + '" fill="' + a.color + '" stroke="#0f172a" stroke-width="1" opacity="0.92"/>';
        }).join('');

        var centerText = total >= 500 ? '500+ pts' : (total + ' pts');
        var svgHtml = '' +
            '<svg width="120" height="120" viewBox="0 0 120 120"' +
            ' style="display:block; margin:0 auto 8px auto; overflow:visible;">' +
            pathsHtml +
            '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" dominant-baseline="middle"' +
            ' style="font-size:9px; fill:#94a3b8; font-family:sans-serif; pointer-events:none;">' +
            centerText + '</text></svg>';

        // 图例
        var legendHtml = top6.map(function (item) {
            var type = item[0], count = item[1];
            var pct = ((count / total) * 100).toFixed(1);
            var color = typeColors[type] || '#7f7f7f';
            return '' +
                '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">' +
                '<div style="display:flex; align-items:center; gap:5px; min-width:0;">' +
                '<div style="width:8px; height:8px; border-radius:50%; background:' + color + '; flex-shrink:0;"></div>' +
                '<span style="font-size:9px; color:#cbd5e1; white-space:nowrap; overflow:hidden; ' +
                'text-overflow:ellipsis; max-width:85px;">' + type + '</span></div>' +
                '<span style="font-size:9px; color:#94a3b8; flex-shrink:0; margin-left:4px;">' + pct + '%</span></div>';
        }).join('');

        var sampledNote = total >= 500
            ? '<div style="margin-top:2px; font-size:8px; color:#475569; text-align:center;">' +
              '(sampled 500 from ' + Number(pointCount).toLocaleString() + ' points)</div>'
            : '';

        return '' +
            '<div style="background:rgba(15,23,42,0.95); color:#f8fafc; padding:12px;' +
            'border-radius:8px; width:210px; border:1px solid #334155;' +
            'font-family:sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.4);">' +
            header + svgHtml +
            '<div style="border-top:1px solid #1e293b; padding-top:6px;">' + legendHtml + '</div>' +
            sampledNote +
            '<div style="margin-top:6px; font-size:8px; color:#475569; text-align:center;">' +
            'Click cluster to zoom in</div></div>';
    }

    function waitForMap(callback) {
        if (window.myMap && window.myMap.getZoom) {
            callback();
        } else {
            setTimeout(function () { waitForMap(callback); }, 200);
        }
    }

    waitForMap(function () {
        var map = window.myMap;
        if (!map) return;

        var clusterPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: 'bottom',
            offset: [0, -28],
            className: 'cluster-popup'
        });

        if (!document.getElementById('cluster-popup-style')) {
            var style = document.createElement('style');
            style.id = 'cluster-popup-style';
            style.innerHTML = '' +
                '.cluster-popup { pointer-events: none !important; }' +
                '.cluster-popup * { pointer-events: none !important; }';
            document.head.appendChild(style);
        }

        var currentHoveredClusterId = null;
        var pendingClusterId = null;

        // ── mousemove ──────────────────────────────────────
        map.on('mousemove', 'clusters', function (e) {
            if (map.getPitch() >= 35) {
                clusterPopup.remove();
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
                clusterPopup.setLngLat(lngLat);
                if (!clusterPopup.isOpen()) clusterPopup.addTo(map);
                return;
            }

            pendingClusterId = clusterId;
            currentHoveredClusterId = clusterId;

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
                        clusterPopup.setHTML(html);
                        if (!clusterPopup.isOpen()) clusterPopup.addTo(map);
                    });
                } catch (ex) {}
            }
        });

        map.on('mouseleave', 'clusters', function () {
            currentHoveredClusterId = null;
            pendingClusterId = null;
            clusterPopup.remove();
        });

        map.on('mouseleave', 'unclustered-point', function () {
            clusterPopup.remove();
        });

        map.on('zoom', function () {
            clusterPopup.remove();
            currentHoveredClusterId = null;
            pendingClusterId = null;
        });

    });

})();