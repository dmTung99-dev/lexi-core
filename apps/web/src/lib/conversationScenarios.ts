export interface TopicCard {
  id: string;
  title: string;
  sub: string;
  topic: string;
}

export interface RoleplayPreset {
  id: string;
  title: string;
  sub: string;
  /** English: who the AI plays. */
  persona: string;
  /** Vietnamese: 3-4 goals shown to the learner. */
  goals: string[];
}

export const TOPIC_CARDS: TopicCard[] = [
  { id: "travel", title: "Du lịch", sub: "Chuyến đi đáng nhớ", topic: "Travel and memorable trips" },
  { id: "work", title: "Công việc", sub: "Một ngày ở văn phòng", topic: "Work and daily life at the office" },
  { id: "food", title: "Ẩm thực", sub: "Món yêu thích", topic: "Food and favourite meals" },
  { id: "media", title: "Phim & sách", sub: "Gần đây bạn xem gì", topic: "Movies, TV shows and books" },
  { id: "tech", title: "Công nghệ", sub: "AI và đời sống", topic: "Technology and AI in everyday life" },
  { id: "health", title: "Sức khỏe", sub: "Thói quen hằng ngày", topic: "Health and daily habits" },
];

export const ROLEPLAY_PRESETS: RoleplayPreset[] = [
  {
    id: "restaurant",
    title: "Gọi món ở nhà hàng",
    sub: "AI là phục vụ",
    persona: "A friendly waiter at an Italian restaurant who speaks clearly and patiently",
    goals: ["Gọi đồ uống", "Gọi món khai vị và món chính", "Hỏi món nào không có hải sản", "Xin thanh toán"],
  },
  {
    id: "hotel",
    title: "Check-in khách sạn",
    sub: "AI là lễ tân",
    persona: "A polite hotel receptionist at the front desk",
    goals: ["Nhận phòng với tên đặt phòng", "Hỏi giờ ăn sáng", "Xin hóa đơn khi trả phòng"],
  },
  {
    id: "bargain",
    title: "Thương lượng giá",
    sub: "AI là người bán",
    persona: "A market stall seller who is friendly but likes to bargain",
    goals: ["Hỏi giá món đồ", "Đề nghị giảm giá lịch sự", "Chốt giá và thanh toán"],
  },
  {
    id: "directions",
    title: "Hỏi đường",
    sub: "AI là người qua đường",
    persona: "A helpful local who knows the neighbourhood well",
    goals: ["Hỏi ga tàu gần nhất ở đâu", "Hỏi mất bao lâu để đi bộ", "Nhắc lại chỉ dẫn để chắc chắn"],
  },
  {
    id: "doctor",
    title: "Đặt lịch khám",
    sub: "AI là lễ tân phòng khám",
    persona: "A calm receptionist at a medical clinic",
    goals: ["Nói lý do muốn đặt lịch", "Mô tả triệu chứng", "Chọn ngày giờ phù hợp"],
  },
];
