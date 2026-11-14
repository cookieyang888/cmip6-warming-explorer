/* CMIP6 explorer. Charts use D3; all calculations run locally on static CSVs. */
const SCENARIOS=['ssp126','ssp245','ssp585'];
const LOCATIONS=['San Diego','New York','London','New Delhi'];
const COLORS={ssp126:'#087f8c',ssp245:'#a66b0a',ssp585:'#c34d3d'};
const LABELS={ssp126:'SSP1-2.6',ssp245:'SSP2-4.5',ssp585:'SSP5-8.5'};
const DASH={ssp126:null,ssp245:'8 4',ssp585:'3 4'};
const state={location:'San Diego',scenarios:[...SCENARIOS],range:[2081,2100],view:'annual'};
const W=1040,H=310,M={top:20,right:24,bottom:40,left:55};
const fmt=d3.format('+.2f'),monthName=m=>d3.timeFormat('%B')(new Date(2000,m-1,1));
const tip=d3.select('#tooltip');
let annual,monthly,annualIndex,monthIndex,baselines,annualDomain,seasonDomain,brush,brushGroup,trendX;
let pendingFrame=0;
function hideTip(){tip.attr('hidden',true)}
function showTip(event,html,target){
 tip.html(html).attr('hidden',null);
 const rect=tip.node().getBoundingClientRect(),anchor=target?.getBoundingClientRect();
 const px=event.clientX??anchor?.x??20,py=event.clientY??anchor?.y??20;
 tip.style('left',Math.max(8,Math.min(innerWidth-rect.width-8,px+15))+'px').style('top',Math.max(8,Math.min(innerHeight-rect.height-8,py+15))+'px');
}
const key=(...parts)=>parts.join('|');
function activeAnnual(location,scenario){return annualIndex.get(key(location,scenario))}
function yearMean(location,scenario){const[a,b]=state.range;return d3.mean(activeAnnual(location,scenario).filter(r=>r.year>=a&&r.year<=b),r=>r.anomaly_c)}
function seasonal(location,scenario){
 const[a,b]=state.range;
 return d3.range(1,13).map(month=>{
  const rows=monthIndex.get(key(location,scenario,month));
  return {month,scenario,value:d3.mean(rows.filter(r=>r.year>=a&&r.year<=b),r=>r.temperature_c)-baselines.get(key(location,month))};
 });
}
function frame(id,domain,x,{height=H,months=false}={}){
 d3.select(id).selectAll('*').remove();
 const svg=d3.select(id).append('svg').attr('viewBox',`0 0 ${W} ${height}`).attr('role','img');
 const y=d3.scaleLinear().domain(domain).range([height-M.bottom,M.top]);
 svg.append('g').attr('class','grid').attr('transform',`translate(${M.left},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W-M.left-M.right)).tickFormat(''));
 svg.append('g').attr('transform',`translate(${M.left},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d=>`${d>0?'+':''}${d} °C`));
 const axis=d3.axisBottom(x);
 if(months)axis.tickValues(d3.range(1,13)).tickFormat(m=>monthName(m).slice(0,3));
 else axis.tickValues(d3.range(2020,2101,10)).tickFormat(d3.format('d'));
 svg.append('g').attr('transform',`translate(0,${height-M.bottom})`).call(axis);
 svg.append('line').attr('class','zero').attr('x1',M.left).attr('x2',W-M.right).attr('y1',y(0)).attr('y2',y(0));
 return{svg,y};
}
function drawTrend(){
 hideTip();trendX=d3.scaleLinear().domain([2015,2100]).range([M.left,W-M.right]);
 const{svg,y}=frame('#trend',annualDomain,trendX);
 svg.attr('aria-label',`Temperature changes near ${state.location}, ${state.view==='annual'?'annual values':'20-year trailing average'}. Use the numeric year controls to change the selected period.`);
 const field=state.view==='annual'?'anomaly_c':'rolling_20yr_anomaly_c';
 for(const s of state.scenarios){
  svg.append('path').datum(activeAnnual(state.location,s)).attr('class','series').attr('stroke',COLORS[s]).attr('stroke-dasharray',DASH[s]).attr('d',d3.line().defined(d=>Number.isFinite(d[field])).x(d=>trendX(d.year)).y(d=>y(d[field])));
 }
 const marker=svg.append('line').attr('class','focus-line').attr('y1',M.top).attr('y2',H-M.bottom).attr('stroke','#7b8c80').attr('stroke-dasharray','2 3').attr('visibility','hidden');
 brush=d3.brushX().extent([[M.left,M.top],[W-M.right,H-M.bottom]]).on('brush end',event=>{
  if(!event.sourceEvent)return;
  hideTip();marker.attr('visibility','hidden');
  if(!event.selection){brushGroup.call(brush.move,state.range.map(trendX));return;}
  let[a,b]=event.selection.map(trendX.invert).map(Math.round);
  state.range=[Math.max(2015,Math.min(2100,a)),Math.max(2015,Math.min(2100,b))];
  syncRange();
  if(event.type==='end'){cancelAnimationFrame(pendingFrame);pendingFrame=0;updateLinked();brushGroup.call(brush.move,state.range.map(trendX));}
  else if(!pendingFrame)pendingFrame=requestAnimationFrame(()=>{pendingFrame=0;updateLinked()});
 });
 brushGroup=svg.append('g').attr('class','brush').call(brush);
 brushGroup.call(brush.move,state.range.map(trendX));
 svg.on('pointermove',event=>{
  if(event.buttons)return hideTip();
  const[x,py]=d3.pointer(event,svg.node());if(x<M.left||x>W-M.right||py<M.top||py>H-M.bottom){hideTip();marker.attr('visibility','hidden');return;}
  const year=Math.max(2015,Math.min(2100,Math.round(trendX.invert(x))));
  marker.attr('x1',trendX(year)).attr('x2',trendX(year)).attr('visibility','visible');
  showTip(event,`<strong>${state.location} · ${year}</strong><br>${state.view==='smooth'?'20-year trailing average<br>':''}`+state.scenarios.map(s=>{const d=activeAnnual(state.location,s).find(r=>r.year===year);return`${LABELS[s]}: ${Number.isFinite(d[field])?fmt(d[field])+' °C':'Window incomplete'}`}).join('<br>'));
 }).on('pointerleave',()=>{hideTip();marker.attr('visibility','hidden')}).on('pointerdown',hideTip);
 d3.select('#view-note').text(state.view==='smooth'?'Each point averages the current year and previous 19 years; the first complete window ends in 2034. Linked views still use the exact selected years.':'Annual values retain modeled year-to-year variation. Switch to the 20-year trailing average to inspect longer-term trajectories.');
}
function drawSeason(){
 const data=state.scenarios.flatMap(s=>seasonal(state.location,s));
 const x=d3.scaleLinear().domain([1,12]).range([M.left,W-M.right]);
 const{svg,y}=frame('#season',seasonDomain,x,{months:true});
 svg.attr('aria-label',`Monthly temperature changes near ${state.location}, ${state.range.join(' to ')}. Exact values are also available in the data table.`);
 for(const s of state.scenarios)svg.append('path').datum(data.filter(d=>d.scenario===s)).attr('class','series').attr('stroke',COLORS[s]).attr('stroke-dasharray',DASH[s]).attr('d',d3.line().x(d=>x(d.month)).y(d=>y(d.value)));
 svg.selectAll('circle').data(data).join('circle').attr('cx',d=>x(d.month)).attr('cy',d=>y(d.value)).attr('r',4).attr('fill',d=>COLORS[d.scenario]).attr('stroke','#fffef9').attr('stroke-width',1).attr('tabindex',0).attr('role','img').attr('aria-label',d=>`${LABELS[d.scenario]}, ${monthName(d.month)}: ${fmt(d.value)} degrees Celsius`).on('pointerenter focus',function(event,d){showTip(event,`<strong>${monthName(d.month)} · ${LABELS[d.scenario]}</strong><br>${state.location} · ${state.range.join('–')}<br>${fmt(d.value)} °C vs historical month`,this)}).on('pointerleave blur',hideTip);
 const highest=SCENARIOS.filter(s=>state.scenarios.includes(s)).at(-1);
 const values=data.filter(d=>d.scenario===highest),peak=d3.greatest(values,d=>d.value),lowest=d3.least(values,d=>d.value);
 d3.select('#season-insight').text(`For ${LABELS[highest]} near ${state.location} in ${state.range.join('–')}, the largest monthly change is ${fmt(peak.value)} °C in ${monthName(peak.month)}; the smallest change is ${fmt(lowest.value)} °C in ${monthName(lowest.month)}. This describes the selected simulation and period.`);
}
function chooseLocation(location){state.location=location;d3.select('#location').property('value',location);renderAll()}
function drawComparison(){
 d3.select('#comparison').selectAll('*').remove();const height=285,left=125,right=90;
 const svg=d3.select('#comparison').append('svg').attr('viewBox',`0 0 ${W} ${height}`).attr('role','img').attr('aria-label',`Comparison of mean annual change across four locations in ${state.range.join(' to ')}.`);
 const x=d3.scaleLinear().domain(annualDomain).range([left,W-right]),y=d3.scaleBand().domain(LOCATIONS).range([5,height-35]).padding(.28);
 svg.append('g').attr('class','grid').attr('transform',`translate(0,${height-35})`).call(d3.axisBottom(x).ticks(8).tickSize(-(height-40)).tickFormat(''));
 svg.append('g').attr('transform',`translate(0,${height-35})`).call(d3.axisBottom(x).ticks(8).tickFormat(d=>`${d>0?'+':''}${d} °C`));
 svg.append('line').attr('class','zero').attr('x1',x(0)).attr('x2',x(0)).attr('y1',5).attr('y2',height-35);
 for(const location of LOCATIONS){
  const g=svg.append('g').attr('class','compare-row');
  g.append('text').attr('class','compare-label').attr('x',left-15).attr('y',y(location)+y.bandwidth()/2).attr('dy','.35em').attr('text-anchor','end').attr('font-weight',location===state.location?'bold':null).attr('tabindex',0).attr('role','button').attr('aria-label',`Explore ${location}`).text(location===state.location?location+' •':location).on('click',()=>chooseLocation(location)).on('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseLocation(location)}});
  state.scenarios.forEach((s,i)=>{const v=yearMean(location,s),barH=y.bandwidth()/state.scenarios.length;
   g.append('rect').attr('class','compare-bar').attr('x',x(Math.min(0,v))).attr('y',y(location)+i*barH).attr('width',Math.max(1,Math.abs(x(v)-x(0)))).attr('height',Math.max(3,barH-2)).attr('fill',COLORS[s]).attr('tabindex',0).attr('role','button').attr('aria-label',`Explore ${location}, ${LABELS[s]}, mean annual change ${fmt(v)} degrees Celsius`).on('click',()=>chooseLocation(location)).on('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseLocation(location)}}).on('pointerenter focus',function(e){showTip(e,`<strong>${location} · ${LABELS[s]}</strong><br>${state.range.join('–')} mean annual change<br>${fmt(v)} °C<br>Click to explore this location`,this)}).on('pointerleave blur',hideTip);
   g.append('text').attr('x',x(v)+(v>=0?7:-7)).attr('y',y(location)+i*barH+barH/2).attr('dy','.3em').attr('text-anchor',v>=0?'start':'end').attr('font-size',10).attr('fill',COLORS[s]).text(fmt(v));
  });
 }
}
function selectedRows(){return d3.range(1,13).map(month=>{const row={month:monthName(month)};for(const s of state.scenarios)row[LABELS[s]+' anomaly (°C)']=seasonal(state.location,s)[month-1].value;return row})}
function updateTable(){const rows=selectedRows();const root=d3.select('#data-table');root.selectAll('*').remove();const table=root.append('table');table.append('caption').style('text-align','left').style('padding','10px 0').text(`Monthly changes near ${state.location}, ${state.range.join('–')}, relative to 1985–2014`);table.append('thead').append('tr').selectAll('th').data(Object.keys(rows[0])).join('th').attr('scope','col').text(d=>d);table.append('tbody').selectAll('tr').data(rows).join('tr').selectAll('td').data(d=>Object.values(d)).join('td').text(d=>typeof d==='number'?fmt(d):d)}
function syncRange(){const[a,b]=state.range;d3.select('#start').property('value',a);d3.select('#end').property('value',b);d3.select('#period').text(`${a}–${b}`);d3.select('#period-context').text(`${b-a+1} year${b===a?'':'s'} · ${state.location}`);d3.selectAll('[data-period]').classed('active',function(){return this.dataset.period===state.range.join(',')}).attr('aria-pressed',function(){return this.dataset.period===state.range.join(',')?'true':'false'})}
function updateLinked(){
 syncRange();hideTip();
 d3.select('#status').text(`${state.location} · ${state.range.join('–')} · ${state.scenarios.length} scenario${state.scenarios.length===1?'':'s'} selected. All temperature axes remain fixed when you change the controls.`);
 const grid=activeAnnual(state.location,'ssp126')[0];
 const lon=grid.grid_lon>180?grid.grid_lon-360:grid.grid_lon;
 d3.select('#grid-note').text(`Nearest model grid cell: ${Math.abs(grid.grid_lat).toFixed(2)}° ${grid.grid_lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(2)}° ${lon>=0?'E':'W'}`);
 d3.selectAll('.place').text(state.location);
 d3.select('#summary').selectAll('.metric').data(SCENARIOS).join('div').attr('class',s=>'metric'+(state.scenarios.includes(s)?'':' disabled')).style('--scenario',s=>COLORS[s]).html(s=>`<span class="metric-label">${LABELS[s]}</span><span class="number">${state.scenarios.includes(s)?fmt(yearMean(state.location,s))+' °C':'—'}</span><p>${state.scenarios.includes(s)?'Mean annual change (°C)':'Scenario hidden'}</p>`);
 drawSeason();drawComparison();if(document.querySelector('.data-details').open)updateTable();
}
function renderAll(){drawTrend();updateLinked()}
function setRange(range){cancelAnimationFrame(pendingFrame);pendingFrame=0;state.range=range;d3.select('#range-error').text('');brushGroup.call(brush.move,range.map(trendX));updateLinked()}
async function init(){
 [annual,monthly]=await Promise.all(['annual','monthly'].map(name=>d3.csv(`data/climate_${name}.csv`,d3.autoType)));
 annual=annual.filter(r=>r.scenario!=='historical');
 annualIndex=d3.group(annual,r=>key(r.location,r.scenario));for(const rows of annualIndex.values())rows.sort((a,b)=>a.year-b.year);
 monthIndex=d3.group(monthly.filter(r=>r.scenario!=='historical'),r=>key(r.location,r.scenario,r.month));
 baselines=d3.rollup(monthly.filter(r=>r.scenario==='historical'),rows=>d3.mean(rows,r=>r.temperature_c),r=>key(r.location,r.month));
 annualDomain=[Math.floor(Math.min(0,d3.min(annual,r=>r.anomaly_c))),Math.ceil(d3.max(annual,r=>r.anomaly_c))];
 const monthExt=d3.extent(monthly.filter(r=>r.scenario!=='historical'),r=>r.temperature_c-baselines.get(key(r.location,r.month)));
 seasonDomain=[Math.floor(Math.min(0,monthExt[0])),Math.ceil(Math.max(1,monthExt[1]))];
 d3.select('#location').on('change',e=>chooseLocation(e.target.value));
 d3.select('#view').on('change',e=>{state.view=e.target.value;drawTrend()});
 d3.selectAll('input[type=checkbox]').on('change',e=>{const chosen=Array.from(document.querySelectorAll('input[type=checkbox]:checked'),n=>n.value);if(!chosen.length){e.target.checked=true;d3.select('#status').text('Keep at least one emissions scenario selected.');return;}state.scenarios=chosen;renderAll()});
 d3.select('#years').on('submit',e=>{e.preventDefault();const a=Number(document.querySelector('#start').value),b=Number(document.querySelector('#end').value);if(!Number.isInteger(a)||!Number.isInteger(b)||a<2015||b>2100||a>b){d3.select('#range-error').text('Choose whole years from 2015 to 2100, with the start no later than the end.');return;}setRange([a,b])});
 d3.selectAll('[data-period]').on('click',e=>setRange(e.currentTarget.dataset.period.split(',').map(Number)));
 d3.select('#reset').on('click',()=>{Object.assign(state,{location:'San Diego',scenarios:[...SCENARIOS],range:[2081,2100],view:'annual'});d3.select('#location').property('value',state.location);d3.select('#view').property('value',state.view);d3.selectAll('input[type=checkbox]').property('checked',true);d3.select('#range-error').text('');renderAll()});
 d3.select('.data-details').on('toggle',function(){if(this.open)updateTable()});
 d3.select('#download').on('click',()=>{const rows=selectedRows().map(row=>({location:state.location,start_year:state.range[0],end_year:state.range[1],baseline:'1985–2014 corresponding month',...row}));const url=URL.createObjectURL(new Blob([d3.csvFormat(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`warming_${state.location.replaceAll(' ','_')}_${state.range.join('-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip()});renderAll();
}
init().catch(error=>{console.error(error);d3.select('#status').text('The data could not be loaded. Refresh the page or run it through the local server described in README.md.');});
