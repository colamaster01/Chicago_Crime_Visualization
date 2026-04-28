const BASE_URL = "https://data.cityofchicago.org/resource/ijzp-q8t2.json";

// 【新增】：定义我们明确列出的 9 大主要犯罪类型
const TOP_CRIMES = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'BURGLARY', 'ROBBERY', 'MOTOR VEHICLE THEFT', 'HOMICIDE'];

// 【新增】：一个专门用来生成完美 SQL 类型条件的辅助函数
function buildCrimeTypeCondition(crimeTypes) {
    if (!crimeTypes || crimeTypes.length === 0) return null;
    
    const hasOther = crimeTypes.includes('OTHER');
    const selectedTops = crimeTypes.filter(t => t !== 'OTHER');

    if (hasOther) {
        // 如果勾选了 OTHER，我们要采取“反向排除法”
        // 找出那些【没有被勾选】的主要类型，然后 NOT IN
        const unselectedTops = TOP_CRIMES.filter(t => !selectedTops.includes(t));
        
        if (unselectedTops.length > 0) {
            const typeString = unselectedTops.map(t => `'${t}'`).join(',');
            return `primary_type NOT IN (${typeString})`;
        }
        // 如果所有主要类型都勾选了，且 OTHER 也勾选了，不需要加任何条件（也就是拉取全库）
        return null; 
    } else {
        // 如果没勾选 OTHER，就按正向查找
        if (selectedTops.length > 0) {
            const typeString = selectedTops.map(t => `'${t}'`).join(',');
            return `primary_type IN (${typeString})`;
        }
        return "1=0"; // 兜底防止意外
    }
}

export const API = {
    buildWhereClause(filters, bounds) {
        let conditions = [];
        
        if (filters.year && filters.year.length === 2) {
            conditions.push(`year >= ${filters.year[0]} AND year <= ${filters.year[1]}`);
        }
        if (filters.month && filters.month.length === 2) {
            conditions.push(`date_extract_m(date) >= ${filters.month[0]} AND date_extract_m(date) <= ${filters.month[1]}`);
        }
        if (filters.hour && filters.hour.length === 2) {
            conditions.push(`date_extract_hh(date) >= ${filters.hour[0]} AND date_extract_hh(date) <= ${filters.hour[1]}`);
        }
        
        // 【修改点】：调用我们写的智能类型判断函数
        if (filters.crimeTypes) {
            const typeCond = buildCrimeTypeCondition(filters.crimeTypes);
            if (typeCond) conditions.push(typeCond);
        }
        
        if (bounds) {
            const latDiff = bounds.getNorth() - bounds.getSouth();
            const lngDiff = bounds.getEast() - bounds.getWest();
            const north = bounds.getNorth() + (latDiff * 0.5);
            const south = bounds.getSouth() - (latDiff * 0.5);
            const east = bounds.getEast() + (lngDiff * 0.5);
            const west = bounds.getWest() - (lngDiff * 0.5);
            conditions.push(`within_box(location, ${north}, ${west}, ${south}, ${east})`);
        }
        return conditions.join(' AND ');
    },

    async fetchCrimes(filters, bounds) {
        if (!bounds || filters.crimeTypes.length === 0) return { type: "FeatureCollection", features: [] };
        const whereClause = this.buildWhereClause(filters, bounds);
        const url = `${BASE_URL}?$where=${whereClause}&$order=date DESC&$limit=20000`;
        try {
            const res = await fetch(url);
            const rawData = await res.json();
            return {
                type: "FeatureCollection",
                features: rawData.map(crime => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [parseFloat(crime.longitude || 0), parseFloat(crime.latitude || 0)] },
                    properties: { id: crime.id, date: crime.date, type: crime.primary_type, description: crime.description }
                }))
            };
        } catch (error) {
            console.error("Fetching data error", error);
            return { type: "FeatureCollection", features: [] };
        }
    },

    async fetchMacroLayer(filters) {
        try {
            if (!window.cachedCommunityGeoJson) {
                const geoRes = await fetch('https://data.cityofchicago.org/resource/igwz-8jzy.geojson');
                window.cachedCommunityGeoJson = await geoRes.json();
            }
            
            const geoJson = JSON.parse(JSON.stringify(window.cachedCommunityGeoJson));

            if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
                geoJson.features.forEach(feature => feature.properties.crime_count = 0);
                return { geoJson, thresholds: { p20: 1, p40: 2, p60: 3, p80: 4 }, isEmpty: true };
            }

            const whereClause = this.buildWhereClause(filters, null);
            const url = `${BASE_URL}?$select=community_area,count(id)&$group=community_area&$where=${whereClause} AND community_area IS NOT NULL`;
            
            const statRes = await fetch(url);
            const rawStats = await statRes.json();
            
            const stats = {};
            rawStats.forEach(row => stats[row.community_area] = parseInt(row.count_id));

            const counts = Object.values(stats).filter(c => c > 0).sort((a, b) => a - b);
            
            let p20 = counts[Math.floor(counts.length * 0.2)] || 1;
            let p40 = counts[Math.floor(counts.length * 0.4)] || 2;
            let p60 = counts[Math.floor(counts.length * 0.6)] || 3;
            let p80 = counts[Math.floor(counts.length * 0.8)] || 4;

            if (p40 <= p20) p40 = p20 + 1;
            if (p60 <= p40) p60 = p40 + 1;
            if (p80 <= p60) p80 = p60 + 1;

            geoJson.features.forEach(feature => {
                const areaId = feature.properties.area_num_1;
                feature.properties.crime_count = stats[areaId] || 0;
            });

            return { geoJson, thresholds: { p20, p40, p60, p80 } };
        } catch (err) {
            console.error("宏观数据加载失败:", err);
            return null;
        }
    },

    async fetchHistograms(filters) {
        if (!filters.crimeTypes || filters.crimeTypes.length === 0) {
            return { year: new Map(), month: new Map(), hour: new Map() };
        }

        const buildWhereExcluding = (excludeKey) => {
            let conditions = [];
            if (excludeKey !== 'year' && filters.year && filters.year.length === 2) {
                conditions.push(`year >= ${filters.year[0]} AND year <= ${filters.year[1]}`);
            }
            if (excludeKey !== 'month' && filters.month && filters.month.length === 2) {
                conditions.push(`date_extract_m(date) >= ${filters.month[0]} AND date_extract_m(date) <= ${filters.month[1]}`);
            }
            if (excludeKey !== 'hour' && filters.hour && filters.hour.length === 2) {
                conditions.push(`date_extract_hh(date) >= ${filters.hour[0]} AND date_extract_hh(date) <= ${filters.hour[1]}`);
            }
            
            // 【修改点】：调用智能类型判断函数
            if (filters.crimeTypes) {
                const typeCond = buildCrimeTypeCondition(filters.crimeTypes);
                if (typeCond) conditions.push(typeCond);
            }
            
            return conditions.length > 0 ? conditions.join(' AND ') : null;
        };

        const fetchGroup = async (extractFunc, excludeKey) => {
            const whereClause = buildWhereExcluding(excludeKey);
            let url = `${BASE_URL}?$select=${extractFunc} as key,count(id)&$group=${extractFunc}`;
            if (whereClause) url += `&$where=${whereClause}`;
            
            try {
                const res = await fetch(url);
                const data = await res.json();
                const map = new Map();
                if (Array.isArray(data)) {
                    data.forEach(d => {
                        if (d.key !== undefined && d.key !== null) {
                            map.set(parseInt(d.key), parseInt(d.count_id));
                        }
                    });
                }
                return map;
            } catch (e) {
                console.error(`Error fetching histogram for ${excludeKey}`, e);
                return new Map();
            }
        };

        const [yearMap, monthMap, hourMap] = await Promise.all([
            fetchGroup('year', 'year'),
            fetchGroup('date_extract_m(date)', 'month'),
            fetchGroup('date_extract_hh(date)', 'hour')
        ]);

        return { year: yearMap, month: monthMap, hour: hourMap };
    }
};