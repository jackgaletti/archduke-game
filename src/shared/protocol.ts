import { z } from 'zod';
export const MAX_PLAYERS = 6;
export const playerCountSchema = z.number().int().min(2).max(MAX_PLAYERS);
const id = z.string().min(1).max(100);
export const targetSchema = z.strictObject({player:id,slot:z.number().int().min(0),rev:z.number().int().min(0)}).strict();
export type Target = z.infer<typeof targetSchema>;
const base = {id:z.string().uuid(), game:z.number().int().min(0), round:z.number().int().min(0)};
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({...base,type:z.literal('ready'),ready:z.boolean()}),
  z.strictObject({...base,type:z.literal('start')}),
  z.strictObject({...base,type:z.literal('peekInitial'),target:targetSchema,reveal:z.boolean()}),
  z.strictObject({...base,type:z.literal('draw'),source:z.enum(['draw','discard']),window:id,turn:z.number().int()}),
  z.strictObject({...base,type:z.literal('resolveDraw'),turn:z.number().int(),target:targetSchema.optional()}),
  z.strictObject({...base,type:z.literal('match'),window:id,slots:z.array(targetSchema).min(1).max(104)}),
  z.strictObject({...base,type:z.literal('effect'),effect:id,skip:z.boolean().optional(),targets:z.array(targetSchema).max(2).optional(),recipient:id.optional()}),
  z.strictObject({...base,type:z.literal('done'),effect:id}),
  z.strictObject({...base,type:z.literal('call'),window:id,turn:z.number().int()}),
  z.strictObject({...base,type:z.literal('finish'),window:id}),
  z.strictObject({...base,type:z.literal('next')}),
  z.strictObject({...base,type:z.literal('pause')}),
  z.strictObject({...base,type:z.literal('resume')}),
  z.strictObject({...base,type:z.literal('abort')}),
  z.strictObject({...base,type:z.literal('redeal')})
]);
export type Command = z.infer<typeof commandSchema>;
export type Reply = {ok:boolean;code:string;message:string;seq:number;results?:string[]};
export type Phase = 'LOBBY'|'NEXT_ROUND_COUNTDOWN'|'INITIAL_PEEK'|'INTER_TURN'|'HOLDING_DRAWN_CARD'|'FINAL_MATCH_WINDOW'|'ROUND_RESULTS'|'GAME_RESULTS';
export type Movement = {id:string;kind:string;from:string;to:string;start:number;end:number;value?:number;under?:number};
export type PublicPlayer = {id:string;name:string;connected:boolean;ready:boolean;reviewingResults?:boolean;viewingLeaderboard?:boolean;peeked:boolean;initialViewed?:number[];initialOpen?:number[];columns:number;slots:{index:number;rev:number;row:number;column:number;occupied:boolean;cardId?:string;value?:number}[]};
export type Result = {player:string;sum:number;count:number;lowest:number;place:number;tie:string};
export type PeekPresentation = {cardId:string;motion:number;duration:number};
export type Reshuffle = {id:string;start:number;moveAt:number;end:number;count:number};
// Opaque card IDs deliberately do not expose the canonical numeric ID/value mapping.
export type InvalidMatch = {
 id:string;room:string;game:number;round:number;turn:number;window:string;seq:number;player:string;reason:'incorrect'|'late';
 attempted:{cardId:string;slot:number;rev:number;value:number};
 penalty:{cardId:string;slot:number;rev:number;row:number;column:number;beforeColumns:number};
 start:number;faceUpAt:number;shakeEnd:number;flightAt:number;end:number;
};
export type View = {
 room:string;code:string;invite:string;you:string;host:string;game:number;round:number;seq:number;phase:Phase;serverNow:number;
 lobby?:{inProgress:boolean;canStart:boolean;players:{id:string;name:string;connected:boolean;ready:boolean}[]};
 initialPeek?:{revealAt:number;hideAt:number;finishAt:number};players:PublicPlayer[];next:string;turn:number;window:string;open:boolean;unlockAt:number;visualUntil:number;restartAt:number;finalEndsAt?:number;betweenRounds?:boolean;roundStartsAt?:number;
 reshufflePending?:boolean;reshuffling?:Reshuffle;drawCount:number;discardCount:number;discard?:number;held?:{id:string;owner:string;source:'draw'|'discard';value?:number};
 effects:{id:string;actor:string;kind:1|11|12;viewUntil?:number;peek?:PeekPresentation;target?:Target;targets?:Target[]}[];caller?:string;finalTurns:string[];
 invalidMatches?:InvalidMatch[];paused?:{reason:string;since:number;graceUntil:number};movements:Movement[];activity:string[];history:Result[][];winners:string[];
 canCallArchduke:boolean;incompatible?:string;lastTurn?:string;acks:Record<string,Reply>;persistence:'memory'|'sqlite';
};
