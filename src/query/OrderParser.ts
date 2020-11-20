export function ParseOrder(ordering: any) {

  let orderingSQL = '';

  let orderSQL: string[] = [];
  for (let order of ordering.ordering) {
    orderSQL.push(
      order.property
      + (order.direction === 'desc' ? 'DESC' : '')
    );

  }

  if (orderSQL.length > 0) {
    orderingSQL += ' ORDER BY ' + orderSQL.join(' , ');
  }

  return orderingSQL;
}