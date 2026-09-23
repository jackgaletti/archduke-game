/** Two-card rows retain their base spacing even beside a longer overflow row. */
export function rowStep(card:number,gap:number,width:number,slots:{occupied:boolean;row:number;column:number}[],row:number){
 const columns=Math.max(2,...slots.filter(s=>s.occupied&&s.row===row).map(s=>s.column+1));
 return columns===2?card+gap:(width-card)/(columns-1);
}
export function relativePlayers<T extends {id:string}>(players:T[],you:string):T[]{
 const index=players.findIndex(p=>p.id===you);return index<0?players:[...players.slice(index),...players.slice(0,index)];
}
/** Current occupied formation determines spacing; base holes retain the full 2×2 footprint. */
export function handGeometry(card:number,gap:number,slots:number,expansion=1){
 const columns=Math.max(2,Math.ceil(slots/2));const width=(card*2+gap)*(slots>4?expansion:1);
 return {columns,width,height:card*2.8+gap,step:(width-card)/(columns-1)};
}
export function playLayout(width:number,height:number,opponents:number){
 const compact=width<700,pad=width<700?12:18,header=width<700?64:80;
 const stripColumns=width<900?Math.min(3,Math.max(1,opponents)):Math.max(1,opponents);
 const stripRows=Math.max(1,Math.ceil(opponents/stripColumns));
 const stripHeight=Math.max(stripRows*(width<700?156:stripRows>1?194:124),Math.min(height*.28,280));
 const groupWidth=(width-2*pad)/stripColumns;
 const opponentCard=Math.max(20,Math.min((groupWidth-30)/4,(stripHeight/stripRows-82)/2.8));
 const gap=8,zone=width<700?12:16;
 const lowerHeight=height-header-stripHeight-52;
 // Reserve a 30% wider own hand even before penalties arrive; piles never shift.
 const expansion=compact?1.25:1.3;
 const byWidth=(width-2*pad-gap*expansion-zone*(compact?1:3))/(2*expansion+1.55*(compact?1:3));
 const byHeight=(lowerHeight-100-gap-(compact?zone:0))/(compact?4.97:2.8);
 const card=Math.max(48,Math.floor(Math.min(byWidth,byHeight)));
 const reserve=(2*card+gap)*expansion;
 const central=Math.floor(.9*Math.min((width-2*pad-reserve-zone*(compact?1:3))/(compact?1:3),compact?card*1.55:(card*2.8+gap)/1.4));
 return {card,central,reserve,expansion,gap,zone,pad,header,stripHeight,stripColumns,stripRows,opponentCard,compact};
}
