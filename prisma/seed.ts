// ── Database seed for development ────────────────────────────
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed well-known collections for testing
  const collections = [
    {
      slug: 'boredapeyachtclub',
      name: 'Bored Ape Yacht Club',
      contractAddress: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      royaltyBps: 250,
      openseaFeeBps: 250,
    },
    {
      slug: 'cryptopunks',
      name: 'CryptoPunks',
      contractAddress: '0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb',
      royaltyBps: 0,
      openseaFeeBps: 0,
    },
    {
      slug: 'azuki',
      name: 'Azuki',
      contractAddress: '0xed5af388653567af2f388e6224dc7c4b3241c544',
      royaltyBps: 500,
      openseaFeeBps: 250,
    },
  ];

  for (const c of collections) {
    await prisma.collection.upsert({
      where: { contractAddress: c.contractAddress },
      create: c,
      update: {},
    });
    console.log(`Seeded collection: ${c.name}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
