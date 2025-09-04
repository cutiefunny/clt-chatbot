import Chat from '../app/components/Chat';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>CLT 챗봇</h1>
      <Chat />
    </main>
  );
}