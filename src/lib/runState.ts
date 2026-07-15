import type{RunStatus}from'./schema';
const allowed:Record<RunStatus,RunStatus[]>={Draft:['Fetching','Analysing','Cancelled'],Fetching:['Analysing','Failed','Cancelled'],Analysing:['Tailoring CV','Building PDF','Failed','Cancelled'],['Tailoring CV']:['Building PDF','Failed','Cancelled'],['Building PDF']:['Completed','Failed','Cancelled'],Completed:[],Failed:['Analysing'],Cancelled:['Analysing']};
export const canTransition=(from:RunStatus,to:RunStatus)=>allowed[from].includes(to);
