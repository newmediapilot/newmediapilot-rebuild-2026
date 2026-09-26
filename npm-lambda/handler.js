exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  console.log('Send message received', body);
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: 'Message received' })
  };
};
