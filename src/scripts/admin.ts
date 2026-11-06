const form = document.querySelector<HTMLFormElement>('[data-admin-order]');
const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
if (form) {
  const paymentMethod = form.querySelector<HTMLSelectElement>('[data-admin-payment-method]')!;
  const paymentAccount = form.querySelector<HTMLInputElement>('[data-admin-payment-account]')!;
  function updatePaymentAccount() {
    const cash = paymentMethod.value === 'cash';
    paymentAccount.required = !cash; paymentAccount.disabled = cash;
    form!.querySelector<HTMLElement>('[data-admin-payment-account-field]')!.hidden = cash;
  }
  updatePaymentAccount();
  paymentMethod.addEventListener('change',updatePaymentAccount);
  const lines = form.querySelector<HTMLElement>('[data-order-lines]')!;
  const itemInputs = () => [...lines.querySelectorAll<HTMLInputElement>('[data-order-item]')];
  const addSelect = form.querySelector<HTMLSelectElement>('[data-add-item-select]');
  const addButton = form.querySelector<HTMLButtonElement>('[data-add-order-item]');
  const total = form.querySelector<HTMLElement>('[data-admin-total]')!;
  const subtotalLabel = form.querySelector<HTMLElement>('[data-admin-subtotal]')!;
  const addControls = form.querySelector<HTMLElement>('[data-add-item-controls]');
  const status = document.querySelector<HTMLElement>('[data-save-status]')!;
  let dirty = false; let saving = false;
  function updateTotals() {
    const subtotal = itemInputs().reduce((n,input)=>n+Number(input.value)*Number(input.dataset.price),0);
    subtotalLabel.textContent = money(subtotal);
    total.textContent = money(subtotal+Number(total.dataset.shipping));
  }
  function updateAddOptions() {
    if (!addSelect || !addButton) return;
    const present = new Set(itemInputs().map(input=>input.dataset.orderItem));
    for (const option of addSelect.options) {
      if (!option.value) continue;
      option.hidden = option.disabled = present.has(option.value);
    }
    addSelect.value = '';
    addButton.disabled = true;
    addControls!.hidden = ![...addSelect.options].some(option=>option.value && !option.disabled);
  }
  updateAddOptions();
  addSelect?.addEventListener('change',()=>{addButton!.disabled=!addSelect.value;});
  addButton?.addEventListener('click',()=>{
    const template = [...form.querySelectorAll<HTMLTemplateElement>('[data-order-line-template]')].find(template=>template.dataset.orderLineTemplate===addSelect!.value);
    if (!template || itemInputs().some(input=>input.dataset.orderItem===addSelect!.value)) return;
    lines.append(template.content.cloneNode(true));
    const added = itemInputs().at(-1)!;
    dirty = true; updateTotals(); updateAddOptions();
    status.className=''; status.textContent='Item added. Save changes to update the order.';
    added.focus();
  });
  lines.addEventListener('click',event=>{
    const button = (event.target as HTMLElement).closest('[data-remove-order-item]');
    if (!button) return;
    button.closest('[data-order-line]')?.remove();
    dirty = true; updateTotals(); updateAddOptions();
    status.className=''; status.textContent='Item removed. Save changes to update the order.';
    (itemInputs()[0] || addSelect)?.focus();
  });
  form.addEventListener('input',event=>{
    if (event.target===addSelect) return;
    dirty = true; updateTotals();
  });
  window.addEventListener('beforeunload',event=>{if(dirty) event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(saving || !form.reportValidity()) return;
    if (!itemInputs().length) { status.className='form-error'; status.textContent='Keep at least one item in the order, or use the cancelled fulfillment status to cancel it.'; return; }
    saving = true; const button = form.querySelector<HTMLButtonElement>('[data-save-order]')!; button.disabled = true;
    status.className=''; status.textContent='Saving changes…';
    const data = new FormData(form); const value = (k:string)=>String(data.get(k)||'');
    try {
      const response = await fetch(`/api/admin/orders/${form.dataset.id}/`,{method:'PATCH',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({version:Number(form.dataset.version),customer:Object.fromEntries(['name','email','address','city','state','zip'].map(k=>[k,value(k)])),payment:{method:value('paymentMethod'),account:value('paymentAccount')},cart:itemInputs().map(input=>({id:input.dataset.orderItem,quantity:Number(input.value)})),payment_status:value('payment_status'),fulfillment_status:value('fulfillment_status'),notes:value('notes'),tracking:value('tracking'),carrier:value('carrier')})});
      const result = await response.json(); if(!response.ok) throw new Error(result.error || 'Changes could not be saved.');
      dirty=false; status.textContent='Changes saved.'; location.reload();
    } catch(error) {status.textContent=error instanceof Error?error.message:'Changes could not be saved. Please try again.';status.className='form-error';status.scrollIntoView({block:'center'});}
    finally {saving=false;button.disabled=false;}
  });
  document.querySelector('[data-print-order]')?.addEventListener('click',()=>{if(dirty){status.textContent='Save your changes before printing the packing slip.';status.className='form-error';return;}window.print();});
}
