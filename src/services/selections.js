export const userSummary = { id: true, username: true, fullname: true };
export const userCounts = { _count: { select: { posts: true, likes: true } } };
export const postCounts = { _count: { select: { likes: true } } };
export const postDetails = { author: { select: userSummary }, ...postCounts };
