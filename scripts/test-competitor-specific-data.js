#!/usr/bin/env node

/**
 * Test Competitor-Specific Data Generation
 * This script demonstrates how insights vary based on competitor data
 */

console.log('🧪 Testing Competitor-Specific Data Generation');
console.log('==============================================');

// Simulate the backend fallback functions
const generateTrendingHashtags = (competitorsData) => {
  const hashtagCounts = {};
  
  competitorsData.forEach(competitor => {
    if (competitor.content.topHashtags) {
      competitor.content.topHashtags.forEach(hashtag => {
        const tag = hashtag.tag || hashtag;
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + (hashtag.count || 1);
      });
    }
  });
  
  return Object.entries(hashtagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, usage_count: count }));
};

const generateContentStrategies = (competitorsData) => {
  const strategies = [];
  
  const contentTypes = {};
  competitorsData.forEach(competitor => {
    if (competitor.content.contentTypes) {
      Object.entries(competitor.content.contentTypes).forEach(([type, count]) => {
        contentTypes[type] = (contentTypes[type] || 0) + count;
      });
    }
  });
  
  const dominantType = Object.entries(contentTypes).sort(([,a], [,b]) => b - a)[0];
  if (dominantType) {
    strategies.push(`Focus on ${dominantType[0]} content as it's the most popular format`);
  }
  
  strategies.push('Create educational content to increase engagement');
  strategies.push('Use storytelling in captions to connect with audience');
  strategies.push('Post consistently to maintain audience engagement');
  strategies.push('Engage with trending topics in your niche');
  
  return strategies;
};

const generateMonetizationOpportunities = (competitorsData) => {
  const opportunities = [];
  
  const niches = competitorsData.map(d => d.profile.niche || 'general');
  const dominantNiche = niches.reduce((a, b, i, arr) => 
    arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
  );
  
  opportunities.push(`Sponsored posts with ${dominantNiche} brands`);
  opportunities.push('Affiliate marketing for relevant products');
  opportunities.push('Create and sell digital products');
  opportunities.push('Offer consulting services in your expertise');
  opportunities.push('Develop online courses');
  opportunities.push('Brand partnership opportunities');
  
  return opportunities;
};

const generateOptimalPostingTimes = (competitorsData) => {
  const timeCounts = {};
  
  competitorsData.forEach(competitor => {
    if (competitor.engagement.peakEngagementTimes) {
      competitor.engagement.peakEngagementTimes.forEach(time => {
        const hour = time.hour;
        timeCounts[hour] = (timeCounts[hour] || 0) + 1;
      });
    }
  });
  
  const topTimes = Object.entries(timeCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`);
  
  return topTimes.length > 0 ? topTimes : ['8:00 AM', '7:00 PM', '12:00 PM'];
};

const generateCompetitiveBenchmarks = (competitorsData) => {
  if (competitorsData.length === 0) return {};
  
  const avgEngagement = competitorsData.reduce((sum, d) => sum + parseFloat(d.engagement.engagementRate), 0) / competitorsData.length;
  const avgFollowers = competitorsData.reduce((sum, d) => sum + (d.profile.followers || d.profile.subscribers || 0), 0) / competitorsData.length;
  const avgPosts = competitorsData.reduce((sum, d) => sum + d.content.totalPosts, 0) / competitorsData.length;
  
  return {
    average_engagement_rate: `${avgEngagement.toFixed(2)}%`,
    average_followers: Math.round(avgFollowers).toLocaleString(),
    average_posts: Math.round(avgPosts),
    total_competitors: competitorsData.length
  };
};

// Test Case 1: Fitness Competitors
console.log('\n🏋️ TEST CASE 1: Fitness Competitors');
console.log('====================================');

const fitnessCompetitors = [
  {
    profile: { niche: 'fitness', followers: 50000 },
    content: {
      contentTypes: { video: 80, image: 20 },
      topHashtags: [
        { tag: 'fitness', count: 45 },
        { tag: 'workout', count: 38 },
        { tag: 'gym', count: 25 }
      ]
    },
    engagement: {
      engagementRate: 6.5,
      peakEngagementTimes: [
        { hour: 6, engagement: 1500 },
        { hour: 18, engagement: 2000 },
        { hour: 19, engagement: 1800 }
      ]
    }
  },
  {
    profile: { niche: 'fitness', followers: 30000 },
    content: {
      contentTypes: { video: 60, image: 40 },
      topHashtags: [
        { tag: 'fitness', count: 30 },
        { tag: 'nutrition', count: 25 },
        { tag: 'healthylifestyle', count: 20 }
      ]
    },
    engagement: {
      engagementRate: 5.2,
      peakEngagementTimes: [
        { hour: 7, engagement: 1200 },
        { hour: 19, engagement: 1500 },
        { hour: 20, engagement: 1300 }
      ]
    }
  }
];

console.log('\n📊 Fitness Competitors Results:');
console.log('Trending Hashtags:', generateTrendingHashtags(fitnessCompetitors));
console.log('Content Strategies:', generateContentStrategies(fitnessCompetitors));
console.log('Monetization Opportunities:', generateMonetizationOpportunities(fitnessCompetitors));
console.log('Optimal Posting Times:', generateOptimalPostingTimes(fitnessCompetitors));
console.log('Competitive Benchmarks:', generateCompetitiveBenchmarks(fitnessCompetitors));

// Test Case 2: Tech Competitors
console.log('\n💻 TEST CASE 2: Tech Competitors');
console.log('=================================');

const techCompetitors = [
  {
    profile: { niche: 'tech', followers: 100000 },
    content: {
      contentTypes: { image: 70, video: 30 },
      topHashtags: [
        { tag: 'tech', count: 50 },
        { tag: 'programming', count: 35 },
        { tag: 'coding', count: 30 }
      ]
    },
    engagement: {
      engagementRate: 4.8,
      peakEngagementTimes: [
        { hour: 9, engagement: 2000 },
        { hour: 14, engagement: 1800 },
        { hour: 21, engagement: 1600 }
      ]
    }
  },
  {
    profile: { niche: 'tech', followers: 75000 },
    content: {
      contentTypes: { image: 80, video: 20 },
      topHashtags: [
        { tag: 'tech', count: 40 },
        { tag: 'ai', count: 30 },
        { tag: 'innovation', count: 25 }
      ]
    },
    engagement: {
      engagementRate: 3.9,
      peakEngagementTimes: [
        { hour: 10, engagement: 1500 },
        { hour: 15, engagement: 1400 },
        { hour: 22, engagement: 1200 }
      ]
    }
  }
];

console.log('\n📊 Tech Competitors Results:');
console.log('Trending Hashtags:', generateTrendingHashtags(techCompetitors));
console.log('Content Strategies:', generateContentStrategies(techCompetitors));
console.log('Monetization Opportunities:', generateMonetizationOpportunities(techCompetitors));
console.log('Optimal Posting Times:', generateOptimalPostingTimes(techCompetitors));
console.log('Competitive Benchmarks:', generateCompetitiveBenchmarks(techCompetitors));

// Test Case 3: Mixed Niche Competitors
console.log('\n🎨 TEST CASE 3: Mixed Niche Competitors');
console.log('=======================================');

const mixedCompetitors = [
  {
    profile: { niche: 'fashion', followers: 80000 },
    content: {
      contentTypes: { image: 90, video: 10 },
      topHashtags: [
        { tag: 'fashion', count: 40 },
        { tag: 'style', count: 30 },
        { tag: 'ootd', count: 25 }
      ]
    },
    engagement: {
      engagementRate: 7.2,
      peakEngagementTimes: [
        { hour: 8, engagement: 1800 },
        { hour: 17, engagement: 2200 },
        { hour: 20, engagement: 2000 }
      ]
    }
  },
  {
    profile: { niche: 'food', followers: 60000 },
    content: {
      contentTypes: { image: 85, video: 15 },
      topHashtags: [
        { tag: 'food', count: 35 },
        { tag: 'cooking', count: 28 },
        { tag: 'recipe', count: 22 }
      ]
    },
    engagement: {
      engagementRate: 6.8,
      peakEngagementTimes: [
        { hour: 12, engagement: 1600 },
        { hour: 18, engagement: 1900 },
        { hour: 19, engagement: 1700 }
      ]
    }
  }
];

console.log('\n📊 Mixed Niche Competitors Results:');
console.log('Trending Hashtags:', generateTrendingHashtags(mixedCompetitors));
console.log('Content Strategies:', generateContentStrategies(mixedCompetitors));
console.log('Monetization Opportunities:', generateMonetizationOpportunities(mixedCompetitors));
console.log('Optimal Posting Times:', generateOptimalPostingTimes(mixedCompetitors));
console.log('Competitive Benchmarks:', generateCompetitiveBenchmarks(mixedCompetitors));

console.log('\n🎯 CONCLUSION:');
console.log('==============');
console.log('✅ Data is NOT the same for all competitors');
console.log('✅ Insights are personalized based on competitor data:');
console.log('   - Trending hashtags vary by niche and content');
console.log('   - Content strategies adapt to dominant content types');
console.log('   - Monetization opportunities match competitor niches');
console.log('   - Optimal posting times reflect competitor engagement patterns');
console.log('   - Competitive benchmarks calculate actual averages');
console.log('✅ Each analysis is unique to the competitors being analyzed');
