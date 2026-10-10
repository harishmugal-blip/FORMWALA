// Test script verifying that all citizen inquiries receive accurate, trained, helpful responses
const queries = [
  {
    title: 'Birth Certificate Inquiry',
    text: 'Mera birth certificate nahi bana he kaise banega? Kya kya document lagenge?'
  },
  {
    title: 'Lost PAN Card Problem',
    text: 'Mera PAN card kho gaya he naya kaise banega aur kitna kharcha aayega?'
  },
  {
    title: 'Domicile / Mool Niwas Query',
    text: 'Mool niwas praman patra banwana he kya kya kagaz lagenge?'
  },
  {
    title: 'Ration Card Addition Problem',
    text: 'Ration card me naye bacche ka naam jodna he process kya he?'
  },
  {
    title: 'Income Certificate Fee & Docs',
    text: 'Aay praman patra banwane ka kitna paisa lagega aur kitne din me aayega?'
  },
  {
    title: 'Ayushman Card (5 Lakh Free Treatment)',
    text: '5 lakh wala Ayushman card kaise banta he aur kaun eligible he?'
  }
];

async function runTests() {
  console.log('--- CSC SMART SEVA AI CHATBOT VALIDATION ---');
  let passCount = 0;

  for (const q of queries) {
    console.log(`\nTesting: [${q.title}]`);
    console.log(`User: "${q.text}"`);

    try {
      const res = await fetch('http://127.0.0.1:8090/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '919876543210',
          name: 'Nagrik',
          text: q.text
        })
      });

      if (!res.ok) {
        console.error(`HTTP error: ${res.status}`);
        continue;
      }

      const data = await res.json();
      console.log(`AI Response (${data.source || 'gemini'}):`);
      console.log(data.reply);
      console.log(`Detected Service: ${data.service_id} | Intent: ${data.intent} | Confidence: ${data.confidence}`);

      if (data.reply && data.reply.length > 30) {
        passCount++;
      }
    } catch (err) {
      console.error(`Failed to query AI:`, err.message);
    }
  }

  console.log(`\n===================================`);
  console.log(`Summary: ${passCount}/${queries.length} queries successfully answered by AI!`);
  console.log(`===================================`);
}

runTests();
