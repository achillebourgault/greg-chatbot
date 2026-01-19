import { postChat } from "./postChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	return postChat(req);
	
}
