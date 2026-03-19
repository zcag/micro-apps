export interface Passage {
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const passages: Passage[] = [
  // Easy passages
  {
    text: 'The sun was setting behind the mountains, casting a warm golden glow across the valley. Birds were singing their evening songs as the day came to a peaceful end. A gentle breeze carried the scent of wildflowers through the air.',
    difficulty: 'easy',
  },
  {
    text: 'She walked along the sandy beach, feeling the cool water wash over her feet. The ocean stretched out before her, endless and blue. Seagulls called overhead as waves rolled gently to shore.',
    difficulty: 'easy',
  },
  {
    text: 'The old bookshop on the corner had been there for as long as anyone could remember. Its wooden shelves were filled with stories waiting to be discovered. The smell of old paper and leather filled the cozy space.',
    difficulty: 'easy',
  },
  {
    text: 'Rain fell softly on the rooftop, creating a soothing rhythm that filled the quiet house. A cup of hot tea sat on the table, steam rising in gentle curls. It was the perfect afternoon for reading a good book.',
    difficulty: 'easy',
  },
  {
    text: 'The garden was full of colors in the spring. Red roses climbed the wooden fence while yellow daisies swayed in the breeze. Butterflies danced from flower to flower in the warm morning light.',
    difficulty: 'easy',
  },
  // Medium passages
  {
    text: 'Technology has fundamentally changed the way we communicate with each other. What once required handwritten letters and weeks of waiting can now be accomplished in seconds with a simple text message. However, some argue that this convenience has come at the cost of deeper, more meaningful connections between people.',
    difficulty: 'medium',
  },
  {
    text: 'The ancient library of Alexandria was one of the largest and most significant libraries of the ancient world. Scholars from across the Mediterranean traveled there to study its vast collection of scrolls. Its destruction remains one of the greatest losses of knowledge in human history.',
    difficulty: 'medium',
  },
  {
    text: 'Coffee cultivation began in Ethiopia centuries ago, where legend says a goat herder noticed his animals becoming energetic after eating certain berries. Today, coffee is the second most traded commodity in the world, with billions of cups consumed daily across every continent.',
    difficulty: 'medium',
  },
  {
    text: 'The development of artificial intelligence presents both extraordinary opportunities and significant challenges for society. While machines can now perform tasks that once required human intelligence, questions about ethics, employment, and the nature of consciousness continue to spark intense debate among researchers and policymakers.',
    difficulty: 'medium',
  },
  {
    text: 'Photography revolutionized the way humans document their experiences and preserve memories. From the earliest daguerreotypes to modern digital cameras, the technology has evolved dramatically while maintaining its fundamental purpose of capturing moments in time for future generations to appreciate.',
    difficulty: 'medium',
  },
  {
    text: 'Urban planning shapes the cities we live in and directly influences our quality of life. Thoughtful design of public spaces, transportation networks, and green areas can foster community engagement, reduce pollution, and create environments where residents feel connected to their neighborhoods.',
    difficulty: 'medium',
  },
  {
    text: 'The process of learning a musical instrument requires patience, dedication, and consistent practice over many months and years. Musicians must develop fine motor skills, ear training, and music theory knowledge simultaneously, making it one of the most complex cognitive activities humans regularly undertake.',
    difficulty: 'medium',
  },
  // Hard passages
  {
    text: 'Quantum mechanics describes nature at the smallest scales of energy levels of atoms and subatomic particles. The mathematical formulations of quantum mechanics are abstract, and the implications of the theory are often counterintuitive, challenging our fundamental understanding of reality. Phenomena such as superposition, entanglement, and wave-particle duality defy classical intuition.',
    difficulty: 'hard',
  },
  {
    text: 'The philosophical implications of consciousness remain one of the most perplexing questions in neuroscience and philosophy of mind. Despite extraordinary advances in brain imaging technology and computational neuroscience, the subjective experience of awareness — what philosophers call "qualia" — continues to elude satisfactory scientific explanation.',
    difficulty: 'hard',
  },
  {
    text: 'Cryptographic protocols underpin the security infrastructure of modern digital communications, enabling authenticated and confidential exchanges between parties who may never physically meet. Asymmetric encryption algorithms, hash functions, and digital signatures form the mathematical foundation upon which electronic commerce and secure messaging depend.',
    difficulty: 'hard',
  },
  {
    text: 'The biodiversity of tropical rainforests encompasses an extraordinarily complex web of interdependent organisms, from microscopic fungi facilitating nutrient exchange through mycorrhizal networks to apex predators maintaining population equilibria. Deforestation threatens not only individual species but entire ecosystems whose pharmaceutical and ecological value remains largely undiscovered.',
    difficulty: 'hard',
  },
  {
    text: 'Archaeological evidence suggests that prehistoric civilizations possessed sophisticated astronomical knowledge, constructing megalithic structures aligned with celestial phenomena. Sites like Stonehenge, Newgrange, and Chichen Itza demonstrate mathematical precision that challenges prevailing assumptions about the technological capabilities of ancient societies.',
    difficulty: 'hard',
  },
  {
    text: 'Epigenetic modifications represent heritable changes in gene expression that occur without alterations to the underlying DNA sequence. Environmental factors including nutrition, stress, and chemical exposure can trigger methylation patterns and histone modifications that influence phenotypic outcomes across multiple generations, complicating traditional genetic determinism.',
    difficulty: 'hard',
  },
];

export function getRandomPassage(): Passage {
  return passages[Math.floor(Math.random() * passages.length)];
}
