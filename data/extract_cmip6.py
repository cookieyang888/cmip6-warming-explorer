from pathlib import Path
import json
import numpy as np
import pandas as pd
import xarray as xr
import gcsfs
OUT=Path(__file__).resolve().parent; OUT.mkdir(exist_ok=True)
CATALOG='https://storage.googleapis.com/cmip6/cmip6-zarr-consolidated-stores.csv'
p=Path('work/cmip6_catalog.csv')
cat=pd.read_csv(p if p.exists() else CATALOG)
scenarios=['historical','ssp126','ssp245','ssp585']
rows=cat.query("source_id=='CESM2' and member_id=='r4i1p1f1' and variable_id=='tas' and table_id=='Amon' and grid_label=='gn' and experiment_id in @scenarios").copy()
assert len(rows)==4 and rows.experiment_id.nunique()==4
rows.to_json(OUT/'source_metadata.json',orient='records',indent=2)
places=[('San Diego',32.7157,-117.1611),('New York',40.7128,-74.0060),('London',51.5074,-0.1278),('New Delhi',28.6139,77.2090)]
gcs=gcsfs.GCSFileSystem(token='anon')
frames=[]
for scenario in scenarios:
 cache=OUT/f'{scenario}_monthly.csv'
 if cache.exists():
  frames.append(pd.read_csv(cache)); continue
 row=rows.loc[rows.experiment_id.eq(scenario)].iloc[0]
 print('Opening',scenario,flush=True)
 ds=xr.open_zarr(gcs.get_mapper(row.zstore),consolidated=True)
 assert ds.tas.attrs['units']=='K'
 start,end=('1985','2014') if scenario=='historical' else ('2015','2100')
 # Vectorized selection reads the four points together, avoiding repeated chunk reads.
 nearest_lons=[float(ds.lon.values[np.argmin(np.abs((ds.lon.values-lon+180)%360-180))]) for _,_,lon in places]
 points=ds.tas.sel(lat=xr.DataArray([v[1] for v in places],dims='location'),lon=xr.DataArray(nearest_lons,dims='location'),method='nearest').sel(time=slice(start,end)).load()
 assert points.sizes['time']==(360 if scenario=='historical' else 1032)
 parts=[]
 for i,(name,lat,lon) in enumerate(places):
  a=points.isel(location=i)
  parts.append(pd.DataFrame(dict(location=name,requested_lat=lat,requested_lon=lon,grid_lat=float(a.lat),grid_lon=float(a.lon),year=a.time.dt.year.values,month=a.time.dt.month.values,days_in_month=a.time.dt.days_in_month.values,temperature_c=a.values.astype(float)-273.15,model='CESM2',member='r4i1p1f1',scenario=scenario,calendar=a.time.dt.calendar)))
 frame=pd.concat(parts,ignore_index=True)
 frame.to_csv(cache,index=False); frames.append(frame)
 print('Saved',scenario,len(frame),'rows',flush=True)
monthly=pd.concat(frames,ignore_index=True)
keys=['location','scenario','year','month']
assert not monthly.duplicated(keys).any() and not monthly.isna().any().any()
assert monthly.groupby(['location','scenario','year']).size().eq(12).all()
assert monthly.temperature_c.between(-100,70).all()
monthly['weighted_temperature']=monthly.temperature_c*monthly.days_in_month
annual=monthly.groupby(['location','scenario','year'],as_index=False).agg(weighted_temperature=('weighted_temperature','sum'),days=('days_in_month','sum'),grid_lat=('grid_lat','first'),grid_lon=('grid_lon','first'))
annual['temperature_c']=annual.pop('weighted_temperature')/annual.pop('days')
baseline=annual[annual.scenario.eq('historical')].groupby('location').temperature_c.mean()
annual['baseline_1985_2014_c']=annual.location.map(baseline)
annual['anomaly_c']=annual.temperature_c-annual.baseline_1985_2014_c
annual['model']='CESM2';annual['member']='r4i1p1f1'
annual=annual.sort_values(['location','scenario','year'])
annual['rolling_20yr_anomaly_c']=annual.groupby(['location','scenario']).anomaly_c.transform(lambda s:s.rolling(20,min_periods=20).mean())
assert len(annual)==1152
monthly=monthly.drop(columns='weighted_temperature')
monthly.to_csv(OUT/'climate_monthly.csv',index=False)
annual.to_csv(OUT/'climate_annual.csv',index=False)
summary=annual[annual.year.between(2081,2100)].groupby(['location','scenario'],as_index=False).agg(mean_temperature_c=('temperature_c','mean'),warming_vs_1985_2014_c=('anomaly_c','mean'))
summary.to_csv(OUT/'late_century_summary.csv',index=False)
report={'monthly_rows':len(monthly),'annual_rows':len(annual),'locations':len(places),'missing_monthly_cells':int(monthly.isna().sum().sum()),'duplicate_months':int(monthly.duplicated(keys).sum()),'all_years_have_12_months':True,'rolling_missing_expected':int(annual.rolling_20yr_anomaly_c.isna().sum()),'historical_baseline_anomaly_means':annual[annual.scenario.eq('historical')].groupby('location').anomaly_c.mean().to_dict()}
(OUT/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2));print(summary.round(3).to_string(index=False))
