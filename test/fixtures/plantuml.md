# PlantUML 描画の確認 {#sec:puml}

Java を使わず、同梱の JavaScript 実装だけで描けているかを確かめるためのファイル。
図式ごとに必要なレイアウト方式が違うので、種類を変えて並べてある。

## 内部レイアウトを使う図

```plantuml {#fig:seq caption="シーケンス図"}
@startuml
actor 利用者 as U
participant "メインプロセス" as M
participant "レンダラ" as R

U -> M : ファイルを開く
activate M
M -> R : doc:opened
activate R
R -> R : 番号付けと描画
R --> M : 完了
deactivate R
M --> U : 表示
deactivate M
@enduml
```

```plantuml {#fig:state caption="状態遷移図"}
@startuml
[*] --> 未読込
未読込 --> 描画中 : ファイルを開く
描画中 --> 表示中 : 描画完了
描画中 --> エラー : 構文エラー
表示中 --> 描画中 : 保存を検知
エラー --> 描画中 : 保存を検知
表示中 --> [*] : 閉じる
@enduml
```

## Graphviz のレイアウトを使う図

```plantuml {#fig:class caption="クラス図"}
@startuml
class 文書 {
  +パス : string
  +本文 : string
  +再読込() : void
}
class 図 {
  +種類 : string
  +実寸 : Size
}
class 表 {
  +列揃え : Align[]
  +LaTeX へ() : string
}
文書 "1" *-- "0..*" 図
文書 "1" *-- "0..*" 表
図 <|-- Mermaid
図 <|-- PlantUML
@enduml
```

```plantuml {#fig:comp caption="コンポーネント図"}
@startuml
package "レンダラ" {
  [描画] --> [図式エンジン]
  [描画] --> [番号付け]
}
package "メインプロセス" {
  [ファイル監視]
  [PDF 生成]
}
[ファイル監視] --> [描画]
[描画] --> [PDF 生成]
@enduml
```

## テーマ指定

```plantuml {#fig:theme caption="テーマを当てたアクティビティ図"}
@startuml
!theme cerulean
start
:.md を読み込む;
:Markdown を解析する;
if (図式フェンスがあるか?) then (ある)
  :SVG を生成する;
else (ない)
endif
:番号を振る;
:画面に出す;
stop
@enduml
```

参照の確認: 流れは [@fig:seq]、構造は [@fig:class]、状態は [@fig:state] を参照。
