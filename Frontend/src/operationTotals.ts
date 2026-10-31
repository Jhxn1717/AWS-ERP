/** Match the server's included-tax breakdown using integer cents and half-up rounding. */
export function operationTotals(lines:{quantity:number;unitPrice:number}[],taxRate:number){
 const cents=lines.reduce((sum,line)=>sum+BigInt(Math.round(line.unitPrice*100))*BigInt(line.quantity),0n);
 const divisor=BigInt(100+taxRate);
 const base=(cents*100n+divisor/2n)/divisor;
 return {total:Number(cents)/100,subtotal:Number(base)/100,tax:Number(cents-base)/100,units:lines.reduce((sum,line)=>sum+line.quantity,0),exceedsLimit:cents>99999999999999n};
}
