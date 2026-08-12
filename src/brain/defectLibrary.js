// ============================================
// defectLibrary.js — static SMT defect knowledge base
// id/type/category/icon + typical root causes, a 5-Why template, and
// corrective actions for each defect type. Pure reference data + lookups.
// ============================================

export const DEFECT_LIBRARY = [
  {id:1,type:"Solder Bridge",cat:"Paste Printing",icon:"⚡",
   causes:["Stencil aperture oversized","Excess paste volume","Board misregistration"],
   whys:["Why bridge? → Excess paste between pads","Why excess? → Aperture oversized","Why oversized? → Stencil not updated after ECO","Why? → No ECO-to-stencil review gate","RC: Process gate missing in ECO workflow"],
   actions:["Check stencil aperture vs pad (IPC-7525)","Verify SPI volume <100%","Update stencil if aperture >10% over pad"],
   prev:"SPI alarm at 90% paste volume. Mandatory stencil review on every ECO."},
  {id:2,type:"Missing Component",cat:"Pick & Place",icon:"❌",
   causes:["Feeder jam","Empty reel","Nozzle clog"],
   whys:["Why missing? → Not picked","Why? → Feeder misfeed","Why? → Tape jam","Why? → PM overdue","RC: PM schedule not enforced"],
   actions:["Inspect feeder tape path","Lower misfeed alarm to 2","Perform feeder PM"],
   prev:"Weekly feeder PM checklist. AOI 100% on critical models."},
  {id:3,type:"Insufficient Solder",cat:"Paste Printing",icon:"🔻",
   causes:["Low paste volume","Worn squeegee","Stencil clog"],
   whys:["Why insufficient? → Low paste","Why low? → Squeegee worn","Why worn? → Exceeded stroke limit","Why? → No blade KPI","RC: No blade replacement trigger"],
   actions:["Replace blade >400k strokes","SPI alarm <80%","Clean stencil every 10 boards"],
   prev:"Blade log with stroke counter. SPI trending per model."},
  {id:4,type:"Tombstone",cat:"Reflow Oven",icon:"🪦",
   causes:["Uneven pad heating","Profile too fast","Paste imbalance"],
   whys:["Why tombstone? → One pad melts first","Why? → Oven zone drift","Why? → Thermocouple uncalibrated","Why? → Not in PM scope","RC: Oven PM incomplete"],
   actions:["Profile with KIC thermocouple","Check zones ±3°C","Recalibrate quarterly"],
   prev:"Quarterly oven profiling. SPC on zone temperatures."},
  {id:5,type:"Component Shift",cat:"Pick & Place",icon:"↗️",
   causes:["Vision offset","Nozzle worn","Conveyor vibration"],
   whys:["Why shift? → Off-center","Why? → Vision offset 0.3mm","Why? → Cal plate dirty","Why? → SOP not followed","RC: No verify after cleaning"],
   actions:["Recalibrate vision","Add post-clean verify to WI","Check nozzle <0.05mm"],
   prev:"Daily vision calibration. Nozzle inspection every 500k."},
  {id:6,type:"Cold Solder",cat:"Reflow Oven",icon:"❄️",
   causes:["Peak temp low","TAL short","Oxidized leads","Expired paste"],
   whys:["Why cold? → Poor bond","Why? → TAL<45s","Why? → Wrong profile","Why? → No model lock","RC: No profile barcode interlock"],
   actions:["Verify correct profile","Confirm TAL 45-90s","Check paste expiry"],
   prev:"Profile barcode lock per model. Paste FIFO."},
  {id:7,type:"Solder Ball",cat:"Paste Printing",icon:"🔴",
   causes:["Moisture in paste","Preheat too fast","Poor stencil release"],
   whys:["Why balls? → Splatter","Why? → Moisture","Why? → Paste not tempered","Why? → Direct from fridge","RC: Paste prep SOP not followed"],
   actions:["Temper paste 4h","Check stencil AR>1.5","Reduce preheat ramp"],
   prev:"Tempering log mandatory. Max 2°C/sec preheat."},
  {id:8,type:"Wrong Component",cat:"Pick & Place",icon:"🔄",
   causes:["Wrong reel","No barcode verify","BOM mismatch"],
   whys:["Why wrong? → Wrong reel","Why? → No verify","Why? → Scanner skipped","Why? → No interlock","RC: No interlock for setup"],
   actions:["100% first-article","Barcode interlock","Verify BOM vs reel"],
   prev:"Barcode interlock mandatory. First article sign-off."},
  {id:9,type:"Polarity Reversal",cat:"Pick & Place",icon:"🔀",
   causes:["Tape reversed","Vision polarity off","Setup error"],
   whys:["Why reversed? → 180°","Why? → Feeder reversed","Why? → Setup error","Why? → No polarity ref","RC: No polarity reference at setup"],
   actions:["Add polarity arrow","Enable vision polarity check","Add to AOI"],
   prev:"Polarity SOP. AOI polarity mandatory for diodes/caps/ICs."},
  {id:10,type:"Lifted Pad",cat:"Reflow Oven",icon:"🔧",
   causes:["Board warp >0.75%","PCB material","Rework overheat"],
   whys:["Why lifted? → Delaminated","Why? → Thermal stress","Why? → Warped","Why? → PCB incoming","RC: No incoming warp inspection"],
   actions:["Add incoming warp measurement","Max 0.75% per IPC-A-610","Review rework profile"],
   prev:"Incoming PCB 3-point warp per lot."},
  {id:11,type:"Open Joint",cat:"Reflow Oven",icon:"🔓",
   causes:["Component float","Pad too short","Board warp"],
   whys:["Why open? → No heel contact","Why? → Float","Why? → Flux outgas fast","Why? → Preheat aggressive","RC: Profile not model-specific"],
   actions:["Reduce preheat <1.5°C/s","Verify pad per IPC-7351","Check heel solder volume"],
   prev:"Model-specific profiles for QFP/SOP. Heel in AOI."},
  {id:12,type:"BGA / Head-in-Pillow",cat:"Reflow Oven",icon:"🫧",
   causes:["BGA oxidation","Peak too low","Board warp at BGA"],
   whys:["Why HiP? → No coalesce","Why? → Board warp","Why? → Tg too low","Why? → Wrong material","RC: PCB material not reviewed"],
   actions:["X-ray 100% BGA","Peak ≥245°C at ball","Check Tg vs reflow"],
   prev:"X-ray sampling for all BGA. Material review mandatory."},
  {id:13,type:"Flux Residue",cat:"Cleaning",icon:"🧪",
   causes:["Recipe mismatch","Machine fault","Insufficient rinse"],
   whys:["Why residue? → Not cleaned","Why? → Short cycle","Why? → Wrong recipe","Why? → Not updated","RC: Paste change without recipe update"],
   actions:["Update cleaning recipe","Check spray pressure","Extend rinse"],
   prev:"Recipe change mandatory with paste change."},
  {id:14,type:"MSL / Moisture Damage",cat:"Handling",icon:"💧",
   causes:["MSL bag broken","Wrong storage","Exceeded floor life"],
   whys:["Why damage? → Moisture","Why? → Outside MSL","Why? → Label ignored","Why? → No tracking","RC: MSL not enforced at incoming"],
   actions:["Bake per J-STD-033","Check humidity card","Verify WH <30°C/60%RH"],
   prev:"MSL tracking at incoming. Dedicated bake oven."},
  {id:15,type:"PCB Scratch / Damage",cat:"Handling",icon:"💥",
   causes:["Conveyor width wrong","Magazine handling","ESD"],
   whys:["Why scratch? → Edge contact","Why? → Wrong width","Why? → Not set at changeover","Why? → Not in SOP","RC: Conveyor width missing from SOP"],
   actions:["Add to changeover SOP","Inspect magazine","Verify ESD grounding"],
   prev:"Conveyor width checklist every changeover. Min 2mm."},
];

/** Looks up a library entry by its defect type name (case-sensitive, matches import data). */
export function findLibraryEntry(defectType) {
  return DEFECT_LIBRARY.find((l) => l.type === defectType) || null;
}

/** Case-insensitive search over defect type + category, for the Library tab's search box. */
export function searchLibrary(query) {
  const q = String(query || '').toLowerCase();
  if (!q) return DEFECT_LIBRARY;
  return DEFECT_LIBRARY.filter(
    (d) => d.type.toLowerCase().includes(q) || d.cat.toLowerCase().includes(q)
  );
}
