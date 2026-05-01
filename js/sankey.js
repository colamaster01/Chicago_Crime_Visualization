import { API } from './api.js';

export const SankeyPanel = {
    isOpen: false,
    currentAreaId: null,
    rawData: null,       // 保存原始数据，用于恢复
    focusedNode: null,   // 记录当前被点击放大的节点名称

    init() {
        // 注入 panel 的 HTML 骨架
        const panel = document.createElement('div');
        panel.id = 'sankey-panel';
        panel.innerHTML = `
            <div id="sankey-header">
                <div>
                    <div id="sankey-title">Community Crime Flow</div>
                    <div id="sankey-subtitle">Crime Type → Time of Day</div>
                </div>
                <button id="sankey-close">✕</button>
            </div>
            <div id="sankey-body">
                <div id="sankey-loading">Loading...</div>
                <svg id="sankey-svg"></svg>
            </div>
        `;
        document.body.appendChild(panel);

        // 注入 Tooltip 的 HTML 骨架
        const tooltip = document.createElement('div');
        tooltip.id = 'sankey-tooltip';
        document.body.appendChild(tooltip);

        document.getElementById('sankey-close').addEventListener('click', () => this.close());

        this._injectStyles();
    },

    async open(areaId, communityName, filters) {
        this.currentAreaId = areaId;
        this.isOpen = true;
        this.focusedNode = null; // 每次打开新社区，重置放大状态

        document.getElementById('sankey-title').textContent = communityName;
        document.getElementById('sankey-panel').classList.add('open');

        // 👑 新增联动：推开底部的热力图图例
        const legend = document.getElementById('severity-legend');
        if (legend) legend.classList.add('shifted-by-sankey');

        await this.update(filters);
    },

    async update(filters) {
        if (!this.isOpen || !this.currentAreaId) return;

        document.getElementById('sankey-loading').style.display = 'flex';
        document.getElementById('sankey-svg').style.display = 'none';
        document.getElementById('sankey-loading').textContent = 'Loading...';

        const data = await API.fetchSankey(this.currentAreaId, filters);
        
        if (!data || data.links.length === 0) {
            document.getElementById('sankey-loading').textContent = 'No data available in current selection.';
            return;
        }

        // 保存一份最原始的数据（深拷贝），防止被 D3 污染
        this.rawData = JSON.parse(JSON.stringify(data));

        // 如果用户在放大状态下拖动了滑块，检查该节点是否还在当前时间段内存在
        if (this.focusedNode) {
            const exists = this.rawData.nodes.some(n => n.name === this.focusedNode);
            if (!exists) this.focusedNode = null; // 不存在了就自动退回全览模式
        }

        document.getElementById('sankey-loading').style.display = 'none';
        document.getElementById('sankey-svg').style.display = 'block';

        this._render();
    },

    close() {
        this.isOpen = false;
        this.focusedNode = null;
        document.getElementById('sankey-panel').classList.remove('open');
        document.getElementById('sankey-tooltip').style.display = 'none';

        // 👑 新增联动：让热力图图例平滑归位
        const legend = document.getElementById('severity-legend');
        if (legend) legend.classList.remove('shifted-by-sankey');
    } /* 下面的代码保持不变，不再赘述，你只需复制全量文件即可 */,

    _render() {
        if (!this.rawData) return;
        const self = this;
        
        const data = JSON.parse(JSON.stringify(this.rawData));
        let displayNodes = data.nodes;
        let displayLinks = data.links;

        const subtitle = document.getElementById('sankey-subtitle');
        if (this.focusedNode) {
            subtitle.innerHTML = `Crime Type → Time of Day <br><span style="color:#fbbf24; font-size:10px;">(Focusing: ${this.focusedNode} - Click node to reset)</span>`;
            
            displayLinks = data.links.filter(l => 
                data.nodes[l.source].name === this.focusedNode || 
                data.nodes[l.target].name === this.focusedNode
            );
            
            const usedIndices = new Set();
            displayLinks.forEach(l => { usedIndices.add(l.source); usedIndices.add(l.target); });
            
            const indexMap = {};
            displayNodes = [];
            let newIdx = 0;
            data.nodes.forEach((n, i) => {
                if (usedIndices.has(i)) {
                    indexMap[i] = newIdx++;
                    displayNodes.push(n);
                }
            });
            displayLinks.forEach(l => {
                l.source = indexMap[l.source];
                l.target = indexMap[l.target];
            });
        } else {
            subtitle.innerHTML = `Crime Type → Time of Day <br><span style="color:#64748b; font-size:10px;">(Click any node to focus & expand)</span>`;
        }

        const container = document.getElementById('sankey-body');
        const W = container.clientWidth - 32; 
        const H = Math.max(400, displayNodes.length * 28);

        const svg = d3.select('#sankey-svg').attr('width', W).attr('height', H);
        svg.selectAll('*').remove(); 

        const sankey = d3.sankey()
            .nodeWidth(14)
            .nodePadding(10)
            .nodeSort((a, b) => {
                const ORDER = ['Late Night', 'Morning', 'Afternoon', 'Night'];
                const ai = ORDER.indexOf(a.name), bi = ORDER.indexOf(b.name);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 0;
                if (bi === -1) return 0;
                return ai - bi;
            })
            .extent([[0, 0], [W, H]]);

        const graph = sankey({ nodes: displayNodes, links: displayLinks });

        const TIME_COLORS = { 'Late Night': '#6366f1', 'Morning': '#f59e0b', 'Afternoon': '#10b981', 'Night': '#3b82f6' };
        const TYPE_COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#818cf8','#e879f9','#94a3b8'];

        graph.nodes.forEach((node, i) => {
            node.color = TIME_COLORS[node.name] || TYPE_COLORS[i % TYPE_COLORS.length];
        });

        const tooltip = d3.select('#sankey-tooltip');

        svg.append('g').selectAll('path')
            .data(graph.links).join('path')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('stroke', d => d.source.color)
            .attr('stroke-width', d => Math.max(1, d.width))
            .attr('fill', 'none')
            .attr('opacity', 0.35)
            .style('cursor', 'pointer')
            .on('mouseover', function() {
                d3.select(this).attr('opacity', 0.65).attr('stroke-width', d => Math.max(2, d.width + 1));
                tooltip.style('display', 'block');
            })
            .on('mousemove', function(e, d) {
                const pctSource = ((d.value / d.source.value) * 100).toFixed(1);
                const pctTarget = ((d.value / d.target.value) * 100).toFixed(1);
                
                tooltip.html(`
                    <div style="font-weight:bold; margin-bottom: 5px; color:#e2e8f0; border-bottom: 1px solid #334155; padding-bottom: 6px;">
                        ${d.source.name} <span style="color:#64748b; margin:0 4px;">→</span> ${d.target.name}
                    </div>
                    <div style="margin-bottom: 6px; font-size: 13px;">
                        Flow Count: <span style="color:#f8fafc; font-weight:bold; font-size:15px; margin-left:4px;">${d.value.toLocaleString()}</span>
                    </div>
                    <div style="color:#94a3b8; font-size: 11px; line-height: 1.6;">
                        <span style="color:#4ade80; font-weight:bold;">${pctSource}%</span> of all ${d.source.name}<br>
                        <span style="color:#60a5fa; font-weight:bold;">${pctTarget}%</span> of all ${d.target.name}
                    </div>
                `);

                let x = e.clientX + 15;
                let y = e.clientY + 15;
                if (x + 220 > window.innerWidth) x = e.clientX - 230;

                tooltip.style('left', x + 'px').style('top', y + 'px');
            })
            .on('mouseout', function(e, d) {
                d3.select(this).attr('opacity', 0.35).attr('stroke-width', Math.max(1, d.width));
                tooltip.style('display', 'none');
            });

        const nodeG = svg.append('g').selectAll('g').data(graph.nodes).join('g');

        nodeG.append('rect')
            .attr('x', d => d.x0)
            .attr('y', d => d.y0)
            .attr('width',  d => d.x1 - d.x0)
            .attr('height', d => Math.max(1, d.y1 - d.y0))
            .attr('fill', d => d.color)
            .attr('rx', 3)
            .style('cursor', 'pointer')
            .on('mouseover', function(e, d) {
                d3.select(this).attr('fill', d3.color(d.color).darker(0.6));
            })
            .on('mouseout', function(e, d) {
                d3.select(this).attr('fill', d.color);
            })
            .on('click', function(e, d) {
                self.focusedNode = (self.focusedNode === d.name) ? null : d.name;
                self._render(); 
            });

        nodeG.append('text')
            .attr('x', d => d.x0 < W / 2 ? d.x1 + 6 : d.x0 - 6) 
            .attr('y', d => (d.y0 + d.y1) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', d => d.x0 < W / 2 ? 'start' : 'end')
            .attr('fill', '#cbd5e1')
            .attr('font-size', 11)
            .style('pointer-events', 'none') 
            .text(d => `${d.name} (${d.value.toLocaleString()})`);
    },

    _injectStyles() {
        if (document.getElementById('sankey-injected-style')) {
            document.getElementById('sankey-injected-style').remove();
        }
        
        const style = document.createElement('style');
        style.id = 'sankey-injected-style';
        style.textContent = `
            #sankey-panel {
                position: fixed;
                top: 40px; 
                left: 0; 
                width: 380px; 
                height: calc(80vh - 40px);
                background: rgba(15, 23, 42, 0.97);
                border-right: 1px solid #1e293b;
                transform: translateX(-100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                font-family: sans-serif;
                box-shadow: 4px 0 15px rgba(0,0,0,0.5);
            }
            #sankey-panel.open {
                transform: translateX(0);
            }
            #sankey-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid #1e293b;
                flex-shrink: 0;
            }
            #sankey-title {
                color: #f8fafc;
                font-size: 16px;
                font-weight: bold;
            }
            #sankey-subtitle {
                color: #64748b;
                font-size: 11px;
                margin-top: 2px;
                line-height: 1.4;
            }
            #sankey-close {
                background: none;
                border: none;
                color: #64748b;
                font-size: 18px;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                transition: color 0.2s;
            }
            #sankey-close:hover { color: #f8fafc; }
            #sankey-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            #sankey-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #64748b;
                font-size: 13px;
            }
            
            #sankey-tooltip {
                position: fixed !important; 
                z-index: 999999 !important; 
                background: rgba(15, 23, 42, 0.95);
                color: #f8fafc;
                padding: 10px 14px;
                border-radius: 8px;
                border: 1px solid #334155;
                font-family: sans-serif;
                font-size: 12px;
                pointer-events: none;
                box-shadow: 0 8px 30px rgba(0,0,0,0.8);
                display: none;
                min-width: 170px;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
        `;
        document.head.appendChild(style);
    }
};