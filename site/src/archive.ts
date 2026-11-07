// §4.12 — PDS4-style label (XML) + table (CSV) of the session: track, inspected data ids, quiz answers.
import { credit } from './credits';
export interface Session { callsign: string; start: string; track: { t: string; lat: number; lon: number; layer: string }[]; inspected: Set<string>; quiz: { id: string; ok: boolean }[]; }
export function exportSession(s: Session) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14).replace(/^(\d{8})(\d{6})$/, '$1_$2');
  const base = `ryugu_walk_${stamp}`; const csv = ['utc,lat_deg,lon_deg_e,layer', ...s.track.map(r => `${r.t},${r.lat.toFixed(5)},${r.lon.toFixed(5)},${r.layer}`)].join('\n');
  const x = (v: string) => v.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- PDS4-style label (the PDS4 schema is imitated, not strictly followed) -->
<Product_Observational>
  <Identification_Area><logical_identifier>urn:ryugu38:walk:${base}</logical_identifier><version_id>1.0</version_id><title>RYUGU 38cm/s walk record (${x(s.callsign)})</title></Identification_Area>
  <Observation_Area><Time_Coordinates><start_date_time>${s.start}</start_date_time><stop_date_time>${new Date().toISOString()}</stop_date_time></Time_Coordinates>
    <Target_Identification><name>(162173) Ryugu</name><reference_frame>IAU_RYUGU, east longitude 0-360</reference_frame></Target_Identification></Observation_Area>
  <File_Area_Observation><File><file_name>${base}.csv</file_name></File><Table_Delimited><records>${s.track.length}</records><field_delimiter>Comma</field_delimiter></Table_Delimited></File_Area_Observation>
  <Inspected_Data>${[...s.inspected].map(i => `<data_id>${x(i)}</data_id>`).join('')}</Inspected_Data>
  <Quiz_Results>${s.quiz.map(q => `<result id="${x(q.id)}" correct="${q.ok}"/>`).join('')}</Quiz_Results>
  <Credits><credit>${x(credit('gallery'))}</credit><credit>${x(credit('onc'))}</credit><credit>${x(credit('mascam'))}</credit><credit>${x(credit('spice'))}</credit><credit>${x(credit('shape'))}</credit><credit>${x(credit('map'))}</credit></Credits>
  <Disclaimer>Unofficial fan site; not affiliated with JAXA/ISAS.</Disclaimer>
</Product_Observational>
`;
  for (const [name, body, type] of [[base + '.xml', xml, 'application/xml'], [base + '.csv', csv, 'text/csv']] as const) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
}
