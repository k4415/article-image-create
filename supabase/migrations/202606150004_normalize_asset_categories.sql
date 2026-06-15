update public.media_assets
set
  problem_category = case
    when problem_category ~ '(血糖|糖尿)' then '血糖・糖尿病'
    when problem_category ~ '(薄毛|抜け毛|頭皮|育毛)' then '薄毛・抜け毛'
    when problem_category ~ '(頻尿|尿もれ|尿漏れ|残尿|夜間尿|膀胱|トイレ)' then '頻尿・尿もれ'
    when problem_category ~ '(視力|老眼|見えづら|眼圧|暗所)' then '視力低下・老眼'
    when problem_category ~ '(肝臓|脂肪肝|肝機能)' then '肝臓'
    when problem_category ~ '(ムダ毛|無駄毛|体毛|脱毛|毛の濃さ)' then 'ムダ毛・脱毛'
    when problem_category ~ '(シミ|シワ|毛穴|ニキビ|美容|肌)' then '美容'
    when problem_category ~ '(痩身|ダイエット|脂肪|体重)' then '痩身'
    when problem_category ~ '(ひざ|膝|腰|関節)' then 'ひざ腰'
    when problem_category ~ '(フェムケア|更年期|デリケート)' then 'フェムケア'
    else problem_category
  end,
  updated_at = now()
where problem_category is not null;

update public.asset_annotations
set
  image_category = case
    when image_category in ('FV', 'ファーストビュー画像') then 'ファーストビュー'
    when image_category in ('ビフォー / アフター', 'ビフォー・アフター') then 'ビフォーアフター'
    else image_category
  end,
  updated_at = now()
where image_category is not null;

delete from public.problem_categories;

insert into public.problem_categories (major, minor, body_part, keywords)
values
  ('血糖・糖尿病', null, 'すい臓・血糖', array['糖尿', '血糖', '高血糖', 'インスリン']),
  ('薄毛・抜け毛', null, '髪・頭皮', array['薄毛', '抜け毛', '頭皮', '育毛']),
  ('頻尿・尿もれ', null, '膀胱・尿道', array['頻尿', '尿もれ', '尿漏れ', '残尿感', '夜間尿']),
  ('視力低下・老眼', null, '目', array['視力', '老眼', '眼圧', '見えづらい']),
  ('肝臓', null, '肝臓', array['肝臓', '脂肪肝', '肝機能']),
  ('ムダ毛・脱毛', null, '体毛', array['ムダ毛', '無駄毛', '体毛', '脱毛']),
  ('美容', null, '肌', array['シミ', 'シワ', '毛穴', 'ニキビ']),
  ('痩身', null, '体型', array['痩身', '脂肪', 'ダイエット', '体重']),
  ('ひざ腰', null, '膝・腰', array['ひざ', '膝', '腰', '関節']),
  ('フェムケア', null, '女性特有悩み', array['フェムケア', '更年期', 'デリケート'])
on conflict (major, minor) do update set
  body_part = excluded.body_part,
  keywords = excluded.keywords;
