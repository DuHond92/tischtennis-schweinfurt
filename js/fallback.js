// ╔══════════════════════════════════════════════════════════════╗
// ║           FALLBACK-DATEN (falls Supabase noch leer)          ║
// ╚══════════════════════════════════════════════════════════════╝
const FALLBACK_TABLES = [
  {id:1,name:"Stadtpark",addr:"Stadtpark Schweinfurt",lat:50.0497,lng:10.2322,type:"outdoor",icon:"🌳",events:[]},
  {id:2,name:"Obere Marktstraße",addr:"Obere Marktstraße, SW",lat:50.0521,lng:10.2352,type:"outdoor",icon:"🏙️",events:[]},
  {id:3,name:"TTC Halle Bellevue",addr:"Turnhalle Bellevue, SW",lat:50.0448,lng:10.2280,type:"indoor",icon:"🏢",events:[]},
  {id:4,name:"Schillerplatz",addr:"Schillerplatz, SW",lat:50.0535,lng:10.2398,type:"outdoor",icon:"🌆",events:[]},
  {id:5,name:"Willy-Sachs-Stadion",addr:"Stadionring, SW",lat:50.0418,lng:10.2265,type:"outdoor",icon:"⚽",events:[]},
  {id:6,name:"Jugendtreff Haardt",addr:"Haardt, SW",lat:50.0575,lng:10.2420,type:"indoor",icon:"🎮",events:[]},
  {id:7,name:"Bürgerpark Ost",addr:"Bürgerpark, SW-Ost",lat:50.0460,lng:10.2450,type:"outdoor",icon:"🌿",events:[]},
  {id:8,name:"Sportanlage Oberndorf",addr:"Sportanlage Oberndorf",lat:50.0380,lng:10.2180,type:"outdoor",icon:"🏅",events:[]},
  {id:9,name:"Mainkai",addr:"Mainkai, SW",lat:50.0500,lng:10.2200,type:"outdoor",icon:"🌊",events:[]}
];

// ╔══════════════════════════════════════════════════════════════╗
// ║           FALLBACK-EVENTS (solange DB leer ist)              ║
// ╚══════════════════════════════════════════════════════════════╝
const FALLBACK_EVENTS = [
  {id:101,name:"Casual Runde für alle",day:"03",mon:"JUL",time:"15:00",type:"casual",tname:"Stadtpark",ticon:"🌳",tid:1,creator:"michaeltroster",p:3,max:6},
  {id:102,name:"Ranked 1v1 Challenge",day:"04",mon:"JUL",time:"16:00",type:"ranked",tname:"Obere Marktstraße",ticon:"🏙️",tid:2,creator:"michaeltroster",p:2,max:2},
  {id:103,name:"Mini-Turnier Bronze",day:"11",mon:"JUL",time:"13:00",type:"turnier",tname:"TTC Halle Bellevue",ticon:"🏢",tid:3,creator:"michaeltroster",p:8,max:16},
  {id:104,name:"Anfänger Willkommen",day:"10",mon:"JUL",time:"14:00",type:"casual",tname:"Stadtpark",ticon:"🌳",tid:1,creator:"michaeltroster",p:1,max:8},
  {id:105,name:"Ranked Night",day:"18",mon:"JUL",time:"19:00",type:"ranked",tname:"TTC Halle Bellevue",ticon:"🏢",tid:3,creator:"michaeltroster",p:4,max:6},
  {id:106,name:"Sunset Ping Pong",day:"16",mon:"JUL",time:"18:30",type:"casual",tname:"Mainkai",ticon:"🌊",tid:9,creator:"michaeltroster",p:6,max:12},
  {id:107,name:"Jugend Casual",day:"07",mon:"JUL",time:"16:00",type:"casual",tname:"Jugendtreff Haardt",ticon:"🎮",tid:6,creator:"michaeltroster",p:4,max:10},
  {id:108,name:"Ranked Challenge",day:"09",mon:"JUL",time:"10:00",type:"ranked",tname:"Sportanlage Oberndorf",ticon:"🏅",tid:8,creator:"michaeltroster",p:2,max:2},
];
