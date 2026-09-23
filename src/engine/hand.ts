import type { Player, Slot } from './model.js';

// Keep the established deal order: top-left, bottom-left, top-right, bottom-right.
// Storage indices are permanent command/movement identities, not grid positions.
const position=(index:number)=>({row:index%2,column:Math.floor(index/2)});
const ordered=(p:Player)=>p.slots.filter(s=>s.card).sort((a,b)=>a.column!-b.column!||a.row!-b.row!);

export function normalizeRows(p:Player){
 p.slots.forEach((slot,i)=>{slot.row??=i%2;slot.column??=Math.floor(i/2);});
 p.columns=Math.max(2,Math.ceil(p.slots.filter(s=>s.card).length/2));
}

/** Only the affected row compacts; transfer the minimum rightmost survivors. */
export function reflowAfterRemoval(p:Player,row:number){
 const rows=[0,1].map(r=>p.slots.filter(s=>s.card&&s.row===r).sort((a,b)=>a.column!-b.column!));
 rows[row].forEach((s,i)=>s.column=i);
 while(Math.abs(rows[0].length-rows[1].length)>1){
  const from=rows[0].length>rows[1].length?0:1,to=1-from;
  const moved=rows[from].pop()!;
  // A shorter row from an older saved state may contain holes.
  rows[to].forEach((s,i)=>s.column=i);
  moved.row=to;moved.column=rows[to].length;rows[to].push(moved);
 }
 p.columns=Math.max(2,rows[0].length,rows[1].length);
}

export function addToHand(p:Player,slot:Slot){
 normalizeRows(p);const cards=ordered(p);
 if(cards.length<4){
  const empty=Array.from({length:4},(_,i)=>position(i)).find(pos=>!cards.some(s=>s.row===pos.row&&s.column===pos.column))!;
  Object.assign(slot,empty);
 }else{
  const top=cards.filter(s=>s.row===0),bottom=cards.filter(s=>s.row===1);
  slot.row=top.length<=bottom.length?0:1;slot.column=(slot.row===0?top:bottom).length;
 }
 // Append-only records preserve old references and animation source endpoints,
 // including when a new instance fills a vacated logical base position.
 p.slots.push(slot);p.columns=Math.max(2,Math.ceil((cards.length+1)/2));
}
