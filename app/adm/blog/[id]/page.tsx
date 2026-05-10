import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import BlogForm from '@/components/adm/blog-form';

export const dynamic = 'force-dynamic';

export default async function EditBlogPost({ params }: { params: { id: string } }) {
  const post = await prisma.blogPost.findUnique({ where: { id: params.id } });
  if (!post) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Editar post</h1>
      <BlogForm initialData={post} />
    </div>
  );
}
